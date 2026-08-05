import {
  ForbiddenException,
  Injectable,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { WorkspaceExportJob } from "../database/entities/workspace-export-job.entity";
import type { CreateWorkspaceExportResponseDto } from "../exports/dto/workspace-export-response.dto";
import { ExportHandlerRegistry } from "../exports/export-handler-registry";
import type { WorkspaceExportHandler } from "../exports/workspace-export-handler";
import { WorkspaceExportsService } from "../exports/workspace-exports.service";
import { hasBooleanPermission } from "../workspace-access/permissions";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { WorkspacePermissionsService } from "../workspace-access/workspace-permissions.service";
import {
  CreateOrderExportDto,
  OrderExportFormat,
  OrderExportMode,
} from "./dto/create-order-export.dto";
import {
  mapOrderExportToListQuery,
  snapshotOrderExportFilters,
} from "./dto/order-export-query.mapper";
import {
  buildOrderExportFile,
  type OrderExportMode as BuilderMode,
  type OrderExportRowContext,
} from "./order-export-file.builder";
import { OrdersService } from "./orders.service";

const LIMIT_MESSAGE =
  "Експорт містить забагато замовлень. Застосуйте фільтри та спробуйте ще раз.";
const DEFAULT_MAX_ROWS = 50_000;
const ORDER_BATCH = 100;

@Injectable()
export class OrderExportHandler
  implements WorkspaceExportHandler, OnModuleInit
{
  readonly type = "orders" as const;

  constructor(
    private readonly registry: ExportHandlerRegistry,
    private readonly workspaceExports: WorkspaceExportsService,
    private readonly orders: OrdersService,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly permissions: WorkspacePermissionsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  private getMaxRows(): number {
    const raw = this.config.get<string>("ORDER_EXPORT_MAX_ROWS");
    const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_ROWS;
  }

  async createForOwner(
    ownerId: number,
    dto: CreateOrderExportDto,
    appRole?: string,
    workspaceIdHint?: number,
  ): Promise<CreateWorkspaceExportResponseDto> {
    await this.requireOrdersView(ownerId, appRole, workspaceIdHint);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);

    const filters = snapshotOrderExportFilters(dto);
    return this.workspaceExports.createJob({
      workspaceId: workspace.id,
      requestedById: ownerId,
      type: "orders",
      mode: dto.type,
      format: dto.format,
      filters,
      options: { mode: dto.type },
    });
  }

  async process(job: WorkspaceExportJob): Promise<void> {
    if (await this.workspaceExports.ensureIdempotentSkip(job)) {
      return;
    }

    const mode = (job.mode ||
      (job.options?.mode as string) ||
      OrderExportMode.orders) as BuilderMode;

    const listQuery = mapOrderExportToListQuery({
      type: mode as OrderExportMode,
      format: job.format as OrderExportFormat,
      filters: (job.filters ?? {}) as never,
    });

    await this.workspaceExports.updateProgress(job.id, 5);

    const orderKeys = await this.orders.collectOrderKeysForExport(
      job.workspaceId,
      listQuery,
    );

    if (orderKeys.length > this.getMaxRows()) {
      await this.workspaceExports.markFailed(job.id, LIMIT_MESSAGE);
      return;
    }

    await this.workspaceExports.updateProgress(job.id, 15);

    const contexts: OrderExportRowContext[] = [];
    let rowsEstimate = 0;
    for (let i = 0; i < orderKeys.length; i += ORDER_BATCH) {
      const chunk = orderKeys.slice(i, i + ORDER_BATCH);
      const batch = await this.orders.loadOrdersForExport(
        job.workspaceId,
        chunk,
      );
      contexts.push(...batch);

      if (mode === "order_items") {
        for (const ctx of batch) {
          const n = ctx.order.items?.length ?? 0;
          rowsEstimate += n > 0 ? n : 1;
        }
      } else {
        rowsEstimate += batch.length;
      }

      if (rowsEstimate > this.getMaxRows()) {
        await this.workspaceExports.markFailed(job.id, LIMIT_MESSAGE);
        return;
      }

      const pct = 15 + Math.floor((i / Math.max(orderKeys.length, 1)) * 70);
      await this.workspaceExports.updateProgress(job.id, Math.min(pct, 85));
    }

    await this.workspaceExports.updateProgress(job.id, 90);

    if (await this.workspaceExports.ensureIdempotentSkip(job)) {
      return;
    }

    const fileName = this.workspaceExports.makeFileName(
      mode === "order_items" ? "order-items-export" : "orders-export",
      job.format,
      job.createdAt,
    );

    const file = await buildOrderExportFile({
      mode,
      contexts,
      format: job.format,
      fileName,
    });

    await this.workspaceExports.markCompleted(job, {
      buffer: file.buffer,
      contentType: file.contentType,
      fileName: file.fileName,
    });
  }

  private async requireOrdersView(
    userId: number,
    appRole?: string,
    workspaceId?: number,
  ): Promise<void> {
    const resolved = await this.permissions.getResolvedForUser(
      userId,
      appRole,
      workspaceId,
    );
    if (!hasBooleanPermission(resolved, "orders.read")) {
      throw new ForbiddenException("Missing permission: orders.view");
    }
  }
}
