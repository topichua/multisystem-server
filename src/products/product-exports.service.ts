import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { randomBytes } from "crypto";
import { LessThan, Repository } from "typeorm";
import {
  ProductExport,
} from "../database/entities/product-export.entity";
import { ProductVariant } from "../database/entities";
import { CloudflareR2Service } from "../storage/cloudflare-r2.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { ProductAuthorizationService } from "../workspace-access/product-authorization.service";
import {
  CreateProductExportDto,
  CreateProductExportResponseDto,
  ProductExportScope as ExportScopeEnum,
  ProductExportStatusResponseDto,
} from "./dto/create-product-export.dto";
import {
  filtersAndSortToListQuery,
  mapExportPayloadToListQuery,
  snapshotFilters,
  snapshotSort,
} from "./dto/product-export-query.mapper";
import {
  buildProductExportFile,
  countVariants,
  type ProductExportBuildInput,
} from "./product-export-file.builder";
import { ProductsService } from "./products.service";
import type { Product } from "../database/entities";
import type { WorkspaceVariantCustomField } from "../database/entities";
import type { VariantStockDto } from "../inventory/dto/stock-response.dto";

const SAFE_FAIL_MESSAGE = "Не вдалося сформувати файл експорту";
const LIMIT_FAIL_MESSAGE =
  "Експорт містить забагато варіантів. Застосуйте фільтри та спробуйте ще раз.";
const DEFAULT_MAX_VARIANTS = 50_000;
const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_SIGNED_URL_SECONDS = 30 * 60;
const PRODUCT_LOAD_BATCH = 200;
const VARIANT_COUNT_BATCH = 1_000;

@Injectable()
export class ProductExportsService {
  private readonly log = new Logger(ProductExportsService.name);

  constructor(
    @InjectRepository(ProductExport)
    private readonly exportRepo: Repository<ProductExport>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly products: ProductsService,
    private readonly r2: CloudflareR2Service,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly productAuthz: ProductAuthorizationService,
    private readonly config: ConfigService,
  ) {}

  getMaxVariants(): number {
    const raw = this.config.get<string>("PRODUCT_EXPORT_MAX_VARIANTS");
    const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_VARIANTS;
  }

  getRetentionDays(): number {
    const raw = this.config.get<string>("PRODUCT_EXPORT_RETENTION_DAYS");
    const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETENTION_DAYS;
  }

  getSignedUrlTtlSeconds(): number {
    const raw = this.config.get<string>("PRODUCT_EXPORT_SIGNED_URL_SECONDS");
    const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(n) && n > 0
      ? Math.min(Math.max(n, 60), 60 * 60)
      : DEFAULT_SIGNED_URL_SECONDS;
  }

  async createForOwner(
    ownerId: number,
    dto: CreateProductExportDto,
    appRole?: string,
    workspaceIdHint?: number,
  ): Promise<CreateProductExportResponseDto> {
    await this.productAuthz.requireExport(ownerId, appRole, workspaceIdHint);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);

    if (dto.scope === ExportScopeEnum.selected) {
      if (!dto.productIds?.length) {
        throw new BadRequestException(
          "productIds is required when scope is selected",
        );
      }
      // Validate ownership early so the client fails synchronously.
      await this.products.collectProductIdsForExport(workspace.id, {
        scope: "selected",
        productIds: dto.productIds,
      });
    }

    const includePurchasePrice =
      await this.productAuthz.canViewPurchasePrice(
        ownerId,
        appRole,
        workspaceIdHint ?? workspace.id,
      );

    const id = `exp_${randomBytes(12).toString("hex")}`;
    const row = this.exportRepo.create({
      id,
      workspaceId: workspace.id,
      requestedById: ownerId,
      scope: dto.scope,
      format: dto.format,
      filters: snapshotFilters(dto),
      sort: snapshotSort(dto),
      productIds:
        dto.scope === ExportScopeEnum.selected
          ? [...new Set(dto.productIds ?? [])]
          : null,
      status: "pending",
      fileKey: null,
      fileName: null,
      fileSize: null,
      errorMessage: null,
      includePurchasePrice,
      startedAt: null,
      completedAt: null,
      expiresAt: null,
    });
    await this.exportRepo.save(row);
    return { id: row.id, status: row.status };
  }

  async getStatusForOwner(
    ownerId: number,
    exportId: string,
    appRole?: string,
    workspaceIdHint?: number,
  ): Promise<ProductExportStatusResponseDto> {
    await this.productAuthz.requireExport(ownerId, appRole, workspaceIdHint);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const row = await this.requireExportInWorkspace(workspace.id, exportId);
    return this.toStatusDto(row, { includeDownloadUrl: true });
  }

  async getDownloadForOwner(
    ownerId: number,
    exportId: string,
    appRole?: string,
    workspaceIdHint?: number,
  ): Promise<{ downloadUrl: string; fileName: string; expiresInSeconds: number }> {
    await this.productAuthz.requireExport(ownerId, appRole, workspaceIdHint);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const row = await this.requireExportInWorkspace(workspace.id, exportId);
    if (row.status !== "completed" || !row.fileKey || !row.fileName) {
      throw new BadRequestException(
        "Export is not ready for download",
      );
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Export file has expired");
    }
    const expiresInSeconds = this.getSignedUrlTtlSeconds();
    const downloadUrl = await this.r2.createSignedGetUrl(
      row.fileKey,
      expiresInSeconds,
    );
    return {
      downloadUrl,
      fileName: row.fileName,
      expiresInSeconds,
    };
  }

  async claimNextForProcessing(): Promise<ProductExport | null> {
    return this.exportRepo.manager.transaction(async (em) => {
      const repo = em.getRepository(ProductExport);
      const row = await repo
        .createQueryBuilder("e")
        .where("e.status = :pending", { pending: "pending" })
        .orderBy("e.created_at", "ASC")
        .limit(1)
        .setLock("pessimistic_write")
        .setOnLocked("skip_locked")
        .getOne();
      if (!row) {
        return null;
      }
      row.status = "processing";
      row.startedAt = row.startedAt ?? new Date();
      row.errorMessage = null;
      return repo.save(row);
    });
  }

  /**
   * Process a claimed job. Idempotent: completed jobs are no-ops.
   */
  async processExportJob(job: ProductExport): Promise<void> {
    const fresh = await this.exportRepo.findOne({ where: { id: job.id } });
    if (!fresh) {
      return;
    }
    if (fresh.status === "completed" && fresh.fileKey) {
      // Idempotent: do not regenerate.
      return;
    }
    if (fresh.status === "expired" || fresh.status === "failed") {
      return;
    }
    if (fresh.status !== "processing") {
      return;
    }

    try {
      if (!this.r2.canUpload()) {
        throw new ServiceUnavailableException(
          "Cloudflare R2 is not configured for product exports",
        );
      }

      const listQuery =
        fresh.scope === "filtered"
          ? filtersAndSortToListQuery(fresh.filters, fresh.sort)
          : mapExportPayloadToListQuery({ scope: fresh.scope });

      const productIds = await this.products.collectProductIdsForExport(
        fresh.workspaceId,
        {
          scope: fresh.scope,
          listQuery,
          productIds: fresh.productIds,
        },
      );

      const variantCount = await this.countVariantsForProductIds(
        fresh.workspaceId,
        productIds,
      );
      if (variantCount > this.getMaxVariants()) {
        await this.markFailed(fresh.id, LIMIT_FAIL_MESSAGE);
        return;
      }

      const loaded = await this.loadAllProductsBatched(
        fresh.workspaceId,
        productIds,
      );

      const fileName = this.buildFileName(fresh.format, fresh.createdAt);
      const buildInput: ProductExportBuildInput = {
        products: loaded.products,
        categoriesById: loaded.categoriesById,
        fieldDefs: loaded.fieldDefs,
        stockMap: loaded.stockMap,
        productImageById: loaded.productImageById,
        includePurchasePrice: fresh.includePurchasePrice,
        format: fresh.format,
        fileName,
      };

      // Double-check limit after full load (safety).
      if (countVariants(loaded.products) > this.getMaxVariants()) {
        await this.markFailed(fresh.id, LIMIT_FAIL_MESSAGE);
        return;
      }

      // Re-read for race / external completion.
      const again = await this.exportRepo.findOne({ where: { id: fresh.id } });
      if (again?.status === "completed" && again.fileKey) {
        return;
      }

      const file = await buildProductExportFile(buildInput);
      const fileKey = `product-exports/${fresh.workspaceId}/${fresh.id}/${fileName}`;
      await this.r2.uploadObject({
        key: fileKey,
        buffer: file.buffer,
        contentType: file.contentType,
      });

      const completedAt = new Date();
      const expiresAt = new Date(
        completedAt.getTime() +
          this.getRetentionDays() * 24 * 60 * 60 * 1000,
      );

      await this.exportRepo.update(fresh.id, {
        status: "completed",
        fileKey,
        fileName,
        fileSize: file.buffer.length,
        completedAt,
        expiresAt,
        errorMessage: null,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.error(`Product export failed id=${fresh.id}: ${err}`);
      await this.markFailed(fresh.id, SAFE_FAIL_MESSAGE);
    }
  }

  async markFailed(id: string, message: string): Promise<void> {
    await this.exportRepo.update(id, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: message.slice(0, 2000),
    });
  }

  /**
   * Delete R2 objects for completed exports past expiresAt and mark expired.
   * Never throws on missing R2 objects.
   */
  async cleanupExpiredExports(): Promise<number> {
    const now = new Date();
    const rows = await this.exportRepo.find({
      where: {
        status: "completed",
        expiresAt: LessThan(now),
      },
      take: 50,
      order: { expiresAt: "ASC" },
    });
    let cleaned = 0;
    for (const row of rows) {
      if (row.fileKey) {
        await this.r2.deleteObject(row.fileKey);
      }
      await this.exportRepo.update(row.id, {
        status: "expired",
        fileKey: null,
      });
      cleaned += 1;
    }
    return cleaned;
  }

  private async requireExportInWorkspace(
    workspaceId: number,
    exportId: string,
  ): Promise<ProductExport> {
    const row = await this.exportRepo.findOne({
      where: { id: exportId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Product export not found");
    }
    return row;
  }

  private async toStatusDto(
    row: ProductExport,
    options: { includeDownloadUrl: boolean },
  ): Promise<ProductExportStatusResponseDto> {
    const base: ProductExportStatusResponseDto = {
      id: row.id,
      status: row.status,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      expiresAt: row.expiresAt,
    };

    if (row.status === "failed") {
      return {
        ...base,
        errorMessage: row.errorMessage ?? SAFE_FAIL_MESSAGE,
      };
    }

    if (row.status === "completed") {
      base.fileName = row.fileName;
      base.fileSize =
        row.fileSize != null ? Number(row.fileSize) : null;
      if (
        options.includeDownloadUrl &&
        row.fileKey &&
        (!row.expiresAt || row.expiresAt.getTime() > Date.now())
      ) {
        try {
          base.downloadUrl = await this.r2.createSignedGetUrl(
            row.fileKey,
            this.getSignedUrlTtlSeconds(),
          );
        } catch {
          base.downloadUrl = null;
        }
      }
    }

    return base;
  }

  private buildFileName(format: string, at: Date): string {
    const d = at ?? new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}`;
    return `products-export-${stamp}.${format}`;
  }

  private async countVariantsForProductIds(
    workspaceId: number,
    productIds: number[],
  ): Promise<number> {
    if (productIds.length === 0) {
      return 0;
    }
    let total = 0;
    for (let i = 0; i < productIds.length; i += VARIANT_COUNT_BATCH) {
      const chunk = productIds.slice(i, i + VARIANT_COUNT_BATCH);
      const count = await this.variantRepo
        .createQueryBuilder("v")
        .innerJoin("v.product", "p")
        .where("p.workspaceId = :workspaceId", { workspaceId })
        .andWhere("v.productId IN (:...ids)", { ids: chunk })
        .getCount();
      total += count;
    }
    return total;
  }

  private async loadAllProductsBatched(
    workspaceId: number,
    productIds: number[],
  ): Promise<{
    products: Product[];
    categoriesById: Map<number, string>;
    fieldDefs: WorkspaceVariantCustomField[];
    stockMap: Map<number, VariantStockDto>;
    productImageById: Map<number, string>;
  }> {
    const products: Product[] = [];
    const categoriesById = new Map<number, string>();
    const stockMap = new Map<number, VariantStockDto>();
    const productImageById = new Map<number, string>();
    let fieldDefs: WorkspaceVariantCustomField[] = [];

    for (let i = 0; i < productIds.length; i += PRODUCT_LOAD_BATCH) {
      const chunk = productIds.slice(i, i + PRODUCT_LOAD_BATCH);
      const loaded = await this.products.loadProductsForExport(
        workspaceId,
        chunk,
      );
      products.push(...loaded.products);
      for (const [k, v] of loaded.categoriesById) {
        categoriesById.set(k, v);
      }
      for (const [k, v] of loaded.stockMap) {
        stockMap.set(k, v);
      }
      for (const [k, v] of loaded.productImageById) {
        productImageById.set(k, v);
      }
      if (loaded.fieldDefs.length) {
        fieldDefs = loaded.fieldDefs;
      }
    }

    return {
      products,
      categoriesById,
      fieldDefs,
      stockMap,
      productImageById,
    };
  }
}
