import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  In,
  IsNull,
  Not,
  Repository,
  type EntityManager,
  type SelectQueryBuilder,
} from "typeorm";
import {
  ClientWishlistItem,
  Product,
  ProductCategory,
  ProductMedia,
  ProductVariant,
  UploadMedia,
  Workspace,
  WorkspaceVariantCustomField,
  OrderItem,
} from "../database/entities";
import { InventoryMode } from "../database/entities/inventory-mode.enum";
import { ProductMediaType } from "../database/entities/product-media-type.enum";
import { ProductStatus } from "../database/entities/product-status.enum";
import { ProductType } from "../database/entities/product-type.enum";
import type { CreateProductDto } from "./dto/create-product.dto";
import type { CreateProductMediaDto } from "./dto/create-product-media.dto";
import type { CreateProductVariantInputDto } from "./dto/create-product-variant-input.dto";
import type { UpdateProductVariantSyncDto } from "./dto/update-product-variant-sync.dto";
import type { CreateProductVariantDto } from "./dto/create-product-variant.dto";
import type { CatalogVariantListResponseDto } from "./dto/catalog-variant-list-response.dto";
import type { ListCatalogVariantsQueryDto } from "./dto/list-catalog-variants-query.dto";
import type { ListProductsQueryDto } from "./dto/list-products-query.dto";
import { ProductListByStatus } from "./dto/product-list-by-status.enum";
import { ProductListSort } from "./dto/product-list-sort.enum";
import type { UpdateProductDto } from "./dto/update-product.dto";
import type { UpdateProductMediaDto } from "./dto/update-product-media.dto";
import type { UpdateProductVariantDto } from "./dto/update-product-variant.dto";
import { WorkspaceSettingsService } from "../workspace-settings/workspace-settings.service";
import {
  assertNoDirectQuantityEdit,
  presentProductStockFields,
} from "../inventory/inventory-quantity.util";
import { InventoryService } from "../inventory/inventory.service";
import type { VariantStockDto } from "../inventory/dto/stock-response.dto";
import { ProductMediaService } from "./product-media.service";
import { mediaSort, pickMainMediaUrl } from "./product-media.util";
import { UploadMediaService } from "./upload-media.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { ProductAuthorizationService } from "../workspace-access/product-authorization.service";
import { VariantCustomFieldsService } from "../variant-custom-fields/variant-custom-fields.service";
import {
  buildVariantTitleFromFields,
  serializeVariantCustomFields,
} from "../variant-custom-fields/variant-custom-fields.util";
import type { VariantCustomFieldValueDto as VariantCustomFieldValueResponse } from "../variant-custom-fields/variant-custom-fields.util";

/** Parent product snapshot embedded on each variant (list/detail). */
export type ProductParentSummaryDto = {
  id: number;
  name: string;
  productType: ProductType;
  categoryId: number | null;
  mainImageUrl: string | null;
  currency: string;
  status: ProductStatus;
};

/** Variant row as nested under `GET /products/:id` (no parent denormalization). */
export type ProductVariantDto = {
  id: number;
  customFields: VariantCustomFieldValueResponse[];
  price: number | null;
  inStock: boolean | null;
  quantity: number | null;
  reservedQuantity: number | null;
  availableQuantity: number | null;
  imageUrl: string | null;
  sku: string | null;
  status: ProductStatus;
  /** Number of unique clients who wishlisted this variant. */
  wishlistCount: number;
  createdAt: Date;
  updatedAt: Date;
  media: ProductMediaDto[];
};

/** Single variant row for `GET /products/variants` (flat list with parent context). */
export type ProductVariantListItemDto = ProductVariantDto & {
  categoryId: number | null;
  name: string;
  product_parent: ProductParentSummaryDto;
};

export type ProductMediaDto = {
  id: number;
  productId: number;
  variantId: number | null;
  uploadMediaId: number | null;
  url: string;
  type: string;
  sourceUrl: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductCategorySummaryDto = {
  id: number;
  name: string;
  parentId: number | null;
};

export type ProductListItemBaseDto = {
  id: number;
  name: string;
  productType: ProductType;
  status: ProductStatus;
  price: number | null;
  currency: string;
  inStock: boolean | null;
  quantity: number | null;
  wishlistCount: number;
  mainImageUrl: string | null;
  categoryId: number | null;
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductListItemDto = ProductListItemBaseDto & {
  variants: ProductVariantDto[];
};

export type InstagramReferencedVariantDto = ProductVariantDto & {
  referenceId: number;
};

export type InstagramReferencedProductListItemDto = ProductListItemBaseDto & {
  variants: InstagramReferencedVariantDto[];
};

export type ProductDetailDto = ProductListItemBaseDto & {
  description: string | null;
  sourceType: string | null;
  createdByUserId: number;
  updatedByUserId: number | null;
  category: ProductCategorySummaryDto | null;
  variants: ProductVariantDto[];
  media: ProductMediaDto[];
};

export type ProductListResponseDto = {
  items: ProductListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
};

export type ProductVariantListResponseDto = {
  items: ProductVariantListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
};

function assertListPriceRange(query: ListProductsQueryDto): void {
  const minP = query.minPrice;
  const maxP = query.maxPrice;
  if (minP !== undefined && maxP !== undefined && minP > maxP) {
    throw new BadRequestException("minPrice must be <= maxPrice");
  }
}

function applyVariantListSort(
  qb: SelectQueryBuilder<ProductVariant>,
  sort: ProductListSort | undefined,
): void {
  switch (sort ?? ProductListSort.created_desc) {
    case ProductListSort.created_asc:
      qb.orderBy("p.createdAt", "ASC").addOrderBy("v.id", "ASC");
      break;
    case ProductListSort.name_asc:
      qb.orderBy("p.name", "ASC").addOrderBy("v.id", "ASC");
      break;
    case ProductListSort.name_desc:
      qb.orderBy("p.name", "DESC").addOrderBy("v.id", "DESC");
      break;
    case ProductListSort.price_asc:
      qb.orderBy("p.price", "ASC").addOrderBy("v.id", "ASC");
      break;
    case ProductListSort.price_desc:
      qb.orderBy("p.price", "DESC").addOrderBy("v.id", "DESC");
      break;
    case ProductListSort.created_desc:
    default:
      qb.orderBy("p.createdAt", "DESC").addOrderBy("v.id", "DESC");
      break;
  }
}

/** Escape `\\`, `%`, `_` for PostgreSQL `ILIKE ... ESCAPE '\\'`. */
function escapePgIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function applyProductListSort(
  qb: SelectQueryBuilder<Product>,
  sort: ProductListSort | undefined,
): void {
  switch (sort ?? ProductListSort.created_desc) {
    case ProductListSort.created_asc:
      qb.orderBy("p.createdAt", "ASC").addOrderBy("p.id", "ASC");
      break;
    case ProductListSort.name_asc:
      qb.orderBy("p.name", "ASC").addOrderBy("p.id", "ASC");
      break;
    case ProductListSort.name_desc:
      qb.orderBy("p.name", "DESC").addOrderBy("p.id", "DESC");
      break;
    case ProductListSort.price_asc:
      qb.orderBy("p.price", "ASC").addOrderBy("p.id", "ASC");
      break;
    case ProductListSort.price_desc:
      qb.orderBy("p.price", "DESC").addOrderBy("p.id", "DESC");
      break;
    case ProductListSort.created_desc:
    default:
      qb.orderBy("p.createdAt", "DESC").addOrderBy("p.id", "DESC");
      break;
  }
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(ProductMedia)
    private readonly mediaRepo: Repository<ProductMedia>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(ClientWishlistItem)
    private readonly clientWishlistRepo: Repository<ClientWishlistItem>,
    private readonly productMedia: ProductMediaService,
    private readonly uploadMedia: UploadMediaService,
    private readonly variantCustomFields: VariantCustomFieldsService,
    private readonly workspaceSettings: WorkspaceSettingsService,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly productAuthz: ProductAuthorizationService,
    private readonly inventory: InventoryService,
  ) {}

  async getWorkspaceIdForOwner(ownerId: number): Promise<number> {
    return this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
  }

  async listForOwner(
    ownerId: number,
    query: ListProductsQueryDto,
  ): Promise<ProductListResponseDto> {
    await this.productAuthz.requireRead(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const pageSize = query.pageSize ?? query.limit ?? 50;
    const page = query.page ?? 1;
    const offset =
      query.page != null ? (page - 1) * pageSize : (query.offset ?? 0);
    const limit = pageSize;
    const categoryIdFilter = await this.parseAndValidateCategoryIdsForList(
      workspace.id,
      query,
    );
    assertListPriceRange(query);

    const qb = this.productRepo
      .createQueryBuilder("p")
      .where("p.workspaceId = :workspaceId", { workspaceId: workspace.id });
    this.applyProductStatusFilter(qb, query);
    if (query.wishlistOnly === true) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM client_wishlist_items w
          WHERE w.product_id = p.id
            AND w.workspace_id = :wishlistWorkspaceId
        )`,
        { wishlistWorkspaceId: workspace.id },
      );
    }
    if (categoryIdFilter?.length) {
      qb.andWhere("p.categoryId IN (:...catIds)", { catIds: categoryIdFilter });
    }
    const minP = query.minPrice;
    const maxP = query.maxPrice;
    if (minP !== undefined && maxP !== undefined) {
      qb.andWhere("p.price BETWEEN :minP AND :maxP", { minP, maxP });
    } else if (minP !== undefined) {
      qb.andWhere("p.price >= :minP", { minP });
    } else if (maxP !== undefined) {
      qb.andWhere("p.price <= :maxP", { maxP });
    }
    const keyword = query.keyword?.trim();
    if (keyword) {
      qb.andWhere("p.name ILIKE :nameKeyword ESCAPE '\\'", {
        nameKeyword: `%${escapePgIlikePattern(keyword)}%`,
      });
    }
    applyProductListSort(qb, query.sort);
    const [rows, total] = await qb.skip(offset).take(limit).getManyAndCount();
    if (rows.length === 0) {
      return {
        items: [],
        total,
        page,
        pageSize,
        limit,
        offset,
      };
    }

    const productIds = rows.map((p) => p.id);
    const loaded = await this.productRepo.find({
      where: { id: In(productIds), workspaceId: workspace.id },
      relations: {
        variants: { customFieldValues: true },
        media: true,
      },
    });
    const byId = new Map(loaded.map((p) => [p.id, p]));
    const fieldDefs =
      await this.variantCustomFields.listDefinitionsForWorkspace(workspace.id);
    const mainImageByProductId =
      await this.loadFirstProductLevelMediaUrls(productIds);

    const variantIds = loaded.flatMap((p) =>
      (p.variants ?? []).map((v) => v.id),
    );
    const stockMap = await this.inventory.getStockMapForVariantIds(
      workspace.id,
      variantIds,
    );
    const wishlistCountByProductId = await this.loadWishlistCountByProductId(
      workspace.id,
      productIds,
    );
    const wishlistCountByVariantId = await this.loadWishlistCountByVariantId(
      workspace.id,
      variantIds,
    );

    return {
      items: rows.map((row) => {
        const p = byId.get(row.id) ?? row;
        return {
          ...this.toListItem(
            p,
            mainImageByProductId,
            stockMap,
            wishlistCountByProductId,
          ),
          variants: this.buildVariantDtos(
            p,
            fieldDefs,
            stockMap,
            undefined,
            wishlistCountByVariantId,
          ),
        };
      }),
      total,
      page,
      pageSize,
      limit,
      offset,
    };
  }

  /**
   * Paginated variant rows for the owner’s catalog: same filters/sort/paging as `GET /products`,
   * but each item is one variant with `product_parent` and variant `media`.
   */
  /**
   * Flat variant rows with embedded product info — for catalog search / order line pickers.
   * Lighter than `GET /products/variants` (no media gallery on each row).
   */
  async listCatalogVariantsForOwner(
    ownerId: number,
    query: ListCatalogVariantsQueryDto,
  ): Promise<CatalogVariantListResponseDto> {
    await this.productAuthz.requireRead(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const pageSize = query.pageSize ?? 50;
    const page = query.page ?? 1;
    const offset = (page - 1) * pageSize;
    const productStatus = query.status ?? ProductStatus.active;
    const searchText = query.q?.trim() || query.keyword?.trim();

    const countQb = this.variantRepo
      .createQueryBuilder("v")
      .innerJoin("v.product", "p");
    this.applyCatalogVariantFilters(
      countQb,
      workspace.id,
      productStatus,
      searchText,
    );
    const total = await countQb.getCount();

    const dataQb = this.variantRepo
      .createQueryBuilder("v")
      .innerJoinAndSelect("v.product", "p")
      .leftJoinAndSelect("v.customFieldValues", "cfv");
    this.applyCatalogVariantFilters(
      dataQb,
      workspace.id,
      productStatus,
      searchText,
    );
    dataQb
      .orderBy("p.name", "ASC")
      .addOrderBy("v.id", "ASC")
      .skip(offset)
      .take(pageSize);
    const rows = await dataQb.getMany();
    const fieldDefs =
      await this.variantCustomFields.listDefinitionsForWorkspace(workspace.id);
    const mainImageByProductId = await this.loadFirstProductLevelMediaUrls([
      ...new Set(rows.map((v) => v.productId)),
    ]);

    const stockMap = await this.inventory.getStockMapForVariantIds(
      workspace.id,
      rows.map((v) => v.id),
    );
    const wishlistCountByVariantId = await this.loadWishlistCountByVariantId(
      workspace.id,
      rows.map((v) => v.id),
    );

    return {
      items: rows.map((v) =>
        this.toCatalogVariantItem(
          v,
          fieldDefs,
          mainImageByProductId,
          stockMap,
          wishlistCountByVariantId,
        ),
      ),
      total,
      page,
      pageSize,
    };
  }

  async listVariantsForOwner(
    ownerId: number,
    query: ListProductsQueryDto,
  ): Promise<ProductVariantListResponseDto> {
    await this.productAuthz.requireRead(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const pageSize = query.pageSize ?? query.limit ?? 50;
    const page = query.page ?? 1;
    const offset =
      query.page != null ? (page - 1) * pageSize : (query.offset ?? 0);
    const limit = pageSize;

    assertListPriceRange(query);
    const categoryIdFilter = await this.parseAndValidateCategoryIdsForList(
      workspace.id,
      query,
    );

    const countQb = this.variantRepo
      .createQueryBuilder("v")
      .innerJoin("v.product", "p");
    this.applyVariantListFilters(
      countQb,
      workspace.id,
      categoryIdFilter,
      query,
    );
    const total = await countQb.getCount();

    const dataQb = this.variantRepo
      .createQueryBuilder("v")
      .innerJoinAndSelect("v.product", "p")
      .leftJoinAndSelect("v.media", "m")
      .leftJoinAndSelect("v.customFieldValues", "cfv");
    this.applyVariantListFilters(dataQb, workspace.id, categoryIdFilter, query);
    applyVariantListSort(dataQb, query.sort);
    const rows = await dataQb.skip(offset).take(limit).getMany();
    const fieldDefs =
      await this.variantCustomFields.listDefinitionsForWorkspace(workspace.id);
    const mainImageByProductId = await this.loadFirstProductLevelMediaUrls([
      ...new Set(rows.map((v) => v.productId)),
    ]);

    const stockMap = await this.inventory.getStockMapForVariantIds(
      workspace.id,
      rows.map((v) => v.id),
    );
    const wishlistCountByVariantId = await this.loadWishlistCountByVariantId(
      workspace.id,
      rows.map((v) => v.id),
    );

    return {
      items: rows.map((v) =>
        this.toVariantListItem(
          v,
          fieldDefs,
          mainImageByProductId,
          stockMap,
          wishlistCountByVariantId,
        ),
      ),
      total,
      page,
      pageSize,
      limit,
      offset,
    };
  }

  async findOneForOwner(
    ownerId: number,
    productId: number,
  ): Promise<ProductDetailDto> {
    await this.productAuthz.requireRead(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const product = await this.productRepo.findOne({
      where: { id: productId, workspaceId: workspace.id },
      relations: {
        category: true,
        variants: { customFieldValues: true },
        media: true,
      },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }
    const fieldDefs =
      await this.variantCustomFields.listDefinitionsForWorkspace(workspace.id);
    const stockMap = await this.inventory.getStockMapForVariantIds(
      workspace.id,
      (product.variants ?? []).map((v) => v.id),
    );
    const wishlistCountByProductId = await this.loadWishlistCountByProductId(
      workspace.id,
      [product.id],
    );
    const wishlistCountByVariantId = await this.loadWishlistCountByVariantId(
      workspace.id,
      (product.variants ?? []).map((v) => v.id),
    );
    return this.toDetail(
      product,
      fieldDefs,
      stockMap,
      wishlistCountByProductId,
      wishlistCountByVariantId,
    );
  }

  async createForOwner(ownerId: number, dto: CreateProductDto): Promise<void> {
    await this.productAuthz.requireWrite(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const defaultCurrency =
      await this.workspaceSettings.getDefaultCurrencyForOwner(ownerId);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("name is required");
    }
    await this.assertCategoryBelongsToWorkspaceIfSet(
      workspace.id,
      dto.categoryId,
    );

    const productType = dto.productType ?? ProductType.single;
    const variantInputs = this.normalizeCreateVariantInputs(dto, productType);

    if (productType === ProductType.variants && variantInputs.length === 0) {
      throw new BadRequestException(
        "At least one variant is required when product_type is variants",
      );
    }

    const stagedMediaIds = this.collectStagedMediaIds(dto);
    const stagedById = await this.uploadMedia.requireForWorkspace(
      workspace.id,
      stagedMediaIds,
    );
    const productStatus = dto.status ?? ProductStatus.active;
    const createdVariants = await this.productRepo.manager.transaction(
      async (em) => {
        const product = em.create(Product, {
          workspaceId: workspace.id,
          categoryId: dto.categoryId ?? null,
          name,
          description: dto.description?.trim() || null,
          status: productStatus,
          productType,
          sourceType: dto.sourceType ?? null,
          price: dto.price ?? null,
          currency: (dto.currency?.trim() || defaultCurrency).slice(0, 8),
          inStock: dto.inStock ?? null,
          weightGrams: dto.weightGrams ?? null,
          lengthCm: dto.lengthCm ?? null,
          widthCm: dto.widthCm ?? null,
          heightCm: dto.heightCm ?? null,
          createdByUserId: ownerId,
          updatedByUserId: null,
        });
        const saved = await em.save(product);

        const variants: Array<{ id: number; quantity?: number }> = [];
        for (const spec of variantInputs) {
          const resolved =
            await this.variantCustomFields.resolveVariantAttributesFromPayload(
              ownerId,
              workspace.id,
              spec.customFields,
              em,
            );
          const variant = await em.save(
            em.create(ProductVariant, {
              productId: saved.id,
              price: spec.price ?? null,
              inStock: spec.inStock ?? null,
              sku: spec.sku?.trim() || null,
              status: spec.status ?? productStatus,
              createdByUserId: ownerId,
              updatedByUserId: null,
            }),
          );
          variants.push({ id: variant.id, quantity: spec.quantity });
          await this.variantCustomFields.upsertValuesForVariant(
            em,
            variant.id,
            resolved,
          );

          if (spec.mediaIds?.length) {
            await this.insertProductMediaFromStaged(
              em,
              workspace.id,
              saved.id,
              variant.id,
              spec.mediaIds,
              stagedById,
            );
          }
        }

        if (dto.mediaIds?.length) {
          await this.insertProductMediaFromStaged(
            em,
            workspace.id,
            saved.id,
            null,
            dto.mediaIds,
            stagedById,
          );
        }

        return variants;
      },
    );

    for (const variant of createdVariants) {
      await this.applySimpleQuantityIfProvided(
        ownerId,
        workspace,
        variant.id,
        variant.quantity,
      );
    }
  }

  async updateForOwner(
    ownerId: number,
    productId: number,
    dto: UpdateProductDto,
  ): Promise<ProductDetailDto> {
    await this.productAuthz.requireWrite(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const product = await this.productRepo.findOne({
      where: { id: productId, workspaceId: workspace.id },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }
    await this.applyProductFieldUpdates(workspace.id, product, ownerId, dto);
    await this.applySingleProductQuantityFromDto(
      ownerId,
      workspace,
      product,
      dto.quantity,
    );
    return this.findOneForOwner(ownerId, productId);
  }

  /**
   * Full product replace (PUT). When `variants` is sent, syncs the variant set:
   * missing rows are hard-deleted or archived if referenced by order items.
   */
  async replaceForOwner(
    ownerId: number,
    productId: number,
    dto: UpdateProductDto,
  ): Promise<ProductDetailDto> {
    await this.productAuthz.requireWrite(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const product = await this.productRepo.findOne({
      where: { id: productId, workspaceId: workspace.id },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    let newVariantQuantities: Array<{
      variantId: number;
      quantity: number | undefined;
    }> = [];

    await this.productRepo.manager.transaction(async (em) => {
      await this.applyProductFieldUpdates(
        workspace.id,
        product,
        ownerId,
        dto,
        em,
      );
      if (dto.variants !== undefined) {
        newVariantQuantities = await this.syncProductVariants(
          em,
          workspace,
          product,
          ownerId,
          dto.variants,
        );
      }
    });

    for (const item of newVariantQuantities) {
      await this.applySimpleQuantityIfProvided(
        ownerId,
        workspace,
        item.variantId,
        item.quantity,
      );
    }

    await this.applySingleProductQuantityFromDto(
      ownerId,
      workspace,
      product,
      dto.quantity,
    );

    return this.findOneForOwner(ownerId, productId);
  }

  async removeForOwner(ownerId: number, productId: number): Promise<void> {
    await this.archiveProductForOwner(ownerId, productId);
  }

  /**
   * Archive product and all of its variants (`status = archived`).
   */
  async archiveProductForOwner(
    ownerId: number,
    productId: number,
  ): Promise<ProductDetailDto> {
    await this.productAuthz.requireWrite(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const product = await this.productRepo.findOne({
      where: { id: productId, workspaceId: workspace.id },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const variants = await this.variantRepo.find({ where: { productId } });

    await this.productRepo.manager.transaction(async (em) => {
      for (const variant of variants) {
        if (variant.status === ProductStatus.archived) {
          continue;
        }
        variant.status = ProductStatus.archived;
        variant.updatedByUserId = ownerId;
        await em.save(variant);
      }
      if (product.status !== ProductStatus.archived) {
        product.status = ProductStatus.archived;
        product.updatedByUserId = ownerId;
        await em.save(product);
      }
    });

    return this.findOneForOwner(ownerId, productId);
  }

  /**
   * Unarchive product and all of its variants (`status = active`).
   */
  async unarchiveProductForOwner(
    ownerId: number,
    productId: number,
  ): Promise<ProductDetailDto> {
    await this.productAuthz.requireWrite(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const product = await this.productRepo.findOne({
      where: { id: productId, workspaceId: workspace.id },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const variants = await this.variantRepo.find({ where: { productId } });

    await this.productRepo.manager.transaction(async (em) => {
      for (const variant of variants) {
        if (variant.status === ProductStatus.active) {
          continue;
        }
        variant.status = ProductStatus.active;
        variant.updatedByUserId = ownerId;
        await em.save(variant);
      }
      if (product.status !== ProductStatus.active) {
        product.status = ProductStatus.active;
        product.updatedByUserId = ownerId;
        await em.save(product);
      }
    });

    return this.findOneForOwner(ownerId, productId);
  }

  /**
   * Permanently deletes the product and all variants. Cascades wishlist,
   * media rows, Instagram refs, suggestions, stock, and custom-field values.
   * Order line items keep snapshots; `product_id` / `variant_id` become null.
   */
  async hardRemoveForOwner(ownerId: number, productId: number): Promise<void> {
    await this.productAuthz.requireWrite(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const product = await this.productRepo.findOne({
      where: { id: productId, workspaceId: workspace.id },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const variants = await this.variantRepo.find({
      where: { productId },
      select: ["id"],
    });
    const variantIds = variants.map((v) => v.id);
    const uploadMediaIds = await this.collectUploadMediaIdsForProduct(productId);

    await this.inventory.releaseActiveReservationsForVariants(
      workspace.id,
      variantIds,
      ownerId,
    );

    await this.productRepo.remove(product);
    await this.uploadMedia.deleteOrphanedForWorkspace(
      workspace.id,
      uploadMediaIds,
    );
  }

  async createVariantForOwner(
    ownerId: number,
    productId: number,
    dto: CreateProductVariantDto,
  ): Promise<ProductDetailDto> {
    await this.productAuthz.requireWrite(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const product = await this.requireProduct(workspace.id, productId);
    await this.assertCanAddVariantToProduct(product);
    const resolved =
      await this.variantCustomFields.resolveVariantAttributesFromPayload(
        ownerId,
        workspace.id,
        dto.customFields,
      );
    const stagedMediaIds = dto.mediaIds ?? [];
    const stagedById = stagedMediaIds.length
      ? await this.uploadMedia.requireForWorkspace(workspace.id, stagedMediaIds)
      : new Map<number, { cdnUrl: string }>();
    const row = this.variantRepo.create({
      productId,
      price: dto.price ?? null,
      inStock: dto.inStock ?? null,
      sku: dto.sku?.trim() || null,
      status: dto.status ?? product.status ?? ProductStatus.active,
      createdByUserId: ownerId,
      updatedByUserId: null,
    });
    const saved = await this.variantRepo.save(row);
    await this.variantCustomFields.upsertValuesForVariant(
      this.variantRepo.manager,
      saved.id,
      resolved,
    );
    if (stagedMediaIds.length > 0) {
      await this.insertProductMediaFromStaged(
        this.variantRepo.manager,
        workspace.id,
        productId,
        saved.id,
        stagedMediaIds,
        stagedById,
      );
    }
    await this.applySimpleQuantityIfProvided(
      ownerId,
      workspace,
      saved.id,
      dto.quantity,
    );
    return this.findOneForOwner(ownerId, productId);
  }

  async updateVariantForOwner(
    ownerId: number,
    productId: number,
    variantId: number,
    dto: UpdateProductVariantDto,
  ): Promise<ProductDetailDto> {
    await this.productAuthz.requireWrite(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    await this.requireProduct(workspace.id, productId);
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, productId },
    });
    if (!variant) {
      throw new NotFoundException("Variant not found");
    }
    if (dto.customFields !== undefined) {
      const resolved =
        await this.variantCustomFields.resolveVariantAttributesFromPayload(
          ownerId,
          workspace.id,
          dto.customFields,
        );
      await this.variantCustomFields.upsertValuesForVariant(
        this.variantRepo.manager,
        variant.id,
        resolved,
      );
    }
    if (dto.price !== undefined) {
      variant.price = dto.price;
    }
    if (dto.inStock !== undefined) {
      variant.inStock = dto.inStock;
    }
    if (dto.quantity !== undefined) {
      await this.applySimpleQuantityIfProvided(
        ownerId,
        workspace,
        variantId,
        dto.quantity,
      );
    }
    if (dto.mediaIds !== undefined) {
      const stagedById =
        dto.mediaIds.length > 0
          ? await this.uploadMedia.requireForWorkspace(
              workspace.id,
              dto.mediaIds,
            )
          : new Map<number, UploadMedia>();
      await this.replaceVariantMediaFromStaged(
        this.variantRepo.manager,
        workspace.id,
        productId,
        variant.id,
        dto.mediaIds,
        stagedById,
      );
    }
    if (dto.sku !== undefined) {
      variant.sku = dto.sku === null ? null : dto.sku.trim() || null;
    }
    if (dto.status !== undefined) {
      variant.status = dto.status;
    }
    variant.updatedByUserId = ownerId;
    await this.variantRepo.save(variant);
    return this.findOneForOwner(ownerId, productId);
  }

  async removeVariantForOwner(
    ownerId: number,
    productId: number,
    variantId: number,
  ): Promise<void> {
    await this.productAuthz.requireWrite(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    await this.requireProduct(workspace.id, productId);
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, productId },
    });
    if (!variant) {
      throw new NotFoundException("Variant not found");
    }
    const orderLinkedVariantIds =
      await this.findVariantIdsReferencedByOrders(productId);
    await this.variantRepo.manager.transaction(async (em) => {
      await this.archiveOrRemoveVariants(
        em,
        [variant],
        orderLinkedVariantIds,
        ownerId,
      );
    });
  }

  /**
   * Archive a single variant. If every variant of the product is archived,
   * the product is archived as well.
   */
  async archiveVariantForOwner(
    ownerId: number,
    productId: number,
    variantId: number,
  ): Promise<ProductDetailDto> {
    await this.productAuthz.requireWrite(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const product = await this.requireProduct(workspace.id, productId);
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, productId },
    });
    if (!variant) {
      throw new NotFoundException("Variant not found");
    }

    await this.variantRepo.manager.transaction(async (em) => {
      if (variant.status !== ProductStatus.archived) {
        variant.status = ProductStatus.archived;
        variant.updatedByUserId = ownerId;
        await em.save(variant);
      }

      const remainingActive = await em.getRepository(ProductVariant).count({
        where: {
          productId,
          status: Not(ProductStatus.archived),
        },
      });
      if (remainingActive === 0 && product.status !== ProductStatus.archived) {
        product.status = ProductStatus.archived;
        product.updatedByUserId = ownerId;
        await em.save(product);
      }
    });

    return this.findOneForOwner(ownerId, productId);
  }

  /**
   * Unarchive a variant (`status = active`). If the parent product is archived,
   * it becomes active because at least one variant is active.
   */
  async unarchiveVariantForOwner(
    ownerId: number,
    productId: number,
    variantId: number,
  ): Promise<ProductDetailDto> {
    await this.productAuthz.requireWrite(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const product = await this.requireProduct(workspace.id, productId);
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, productId },
    });
    if (!variant) {
      throw new NotFoundException("Variant not found");
    }

    await this.variantRepo.manager.transaction(async (em) => {
      if (variant.status !== ProductStatus.active) {
        variant.status = ProductStatus.active;
        variant.updatedByUserId = ownerId;
        await em.save(variant);
      }
      if (product.status === ProductStatus.archived) {
        product.status = ProductStatus.active;
        product.updatedByUserId = ownerId;
        await em.save(product);
      }
    });

    return this.findOneForOwner(ownerId, productId);
  }

  /**
   * Permanently deletes a variant even when referenced by order line items.
   * Order lines keep snapshots; `variant_id` (and `product_id` if the product
   * is also gone) become null. Cascades wishlist, media, stock, etc.
   */
  async hardRemoveVariantForOwner(
    ownerId: number,
    productId: number,
    variantId: number,
  ): Promise<void> {
    await this.productAuthz.requireWrite(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    await this.requireProduct(workspace.id, productId);
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, productId },
    });
    if (!variant) {
      throw new NotFoundException("Variant not found");
    }

    const uploadMediaIds =
      await this.collectUploadMediaIdsForVariant(productId, variantId);

    await this.inventory.releaseActiveReservationsForVariants(
      workspace.id,
      [variantId],
      ownerId,
    );

    await this.variantRepo.remove(variant);
    await this.uploadMedia.deleteOrphanedForWorkspace(
      workspace.id,
      uploadMediaIds,
    );
  }

  async createMediaForOwner(
    ownerId: number,
    productId: number,
    dto: CreateProductMediaDto,
  ): Promise<ProductDetailDto> {
    await this.productAuthz.requireWrite(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    await this.productMedia.addMedia(workspace.id, ownerId, {
      productId,
      variantId: dto.variantId,
      url: dto.url,
      type: dto.type,
      sourceUrl: dto.sourceUrl,
      sortOrder: dto.sortOrder,
    });
    return this.findOneForOwner(ownerId, productId);
  }

  async updateMediaForOwner(
    ownerId: number,
    productId: number,
    mediaId: number,
    dto: UpdateProductMediaDto,
  ): Promise<ProductDetailDto> {
    await this.productAuthz.requireWrite(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    await this.requireProduct(workspace.id, productId);
    const media = await this.mediaRepo.findOne({
      where: { id: mediaId, productId },
    });
    if (!media) {
      throw new NotFoundException("Media not found");
    }
    if (dto.url !== undefined) {
      media.url = dto.url === null ? "" : dto.url.trim();
      if (!media.url) {
        throw new BadRequestException("url must not be empty");
      }
    }
    if (dto.type !== undefined) {
      media.type = dto.type;
    }
    if (dto.sourceUrl !== undefined) {
      media.sourceUrl =
        dto.sourceUrl === null ? null : dto.sourceUrl.trim() || null;
    }
    if (dto.sortOrder !== undefined) {
      media.sortOrder = dto.sortOrder;
    }
    await this.mediaRepo.save(media);
    return this.findOneForOwner(ownerId, productId);
  }

  async removeMediaForOwner(
    ownerId: number,
    productId: number,
    mediaId: number,
  ): Promise<void> {
    await this.productAuthz.requireWrite(ownerId);
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    await this.requireProduct(workspace.id, productId);
    const media = await this.mediaRepo.findOne({
      where: { id: mediaId, productId },
    });
    if (!media) {
      throw new NotFoundException("Media not found");
    }
    await this.mediaRepo.remove(media);
  }

  private collectStagedMediaIds(dto: CreateProductDto): number[] {
    const ids = new Set<number>();
    for (const id of dto.mediaIds ?? []) {
      ids.add(id);
    }
    for (const variant of dto.variants ?? []) {
      for (const id of variant.mediaIds ?? []) {
        ids.add(id);
      }
    }
    return [...ids];
  }

  private firstStagedCdnUrl(
    mediaIds: number[] | undefined,
    stagedById: Map<number, { cdnUrl: string }>,
  ): string | null {
    const firstId = mediaIds?.[0];
    if (firstId == null) {
      return null;
    }
    return stagedById.get(firstId)?.cdnUrl ?? null;
  }

  private async insertProductMediaFromStaged(
    em: EntityManager,
    workspaceId: number,
    productId: number,
    variantId: number | null,
    mediaIds: number[],
    stagedById: Map<number, { cdnUrl: string }>,
  ): Promise<void> {
    if (mediaIds.length === 0) {
      return;
    }
    for (let i = 0; i < mediaIds.length; i++) {
      const staged = stagedById.get(mediaIds[i]);
      if (!staged) {
        continue;
      }
      await em.insert(ProductMedia, {
        workspaceId,
        productId,
        variantId,
        uploadMediaId: mediaIds[i],
        url: staged.cdnUrl,
        type: ProductMediaType.image,
        sourceUrl: null,
        sortOrder: i,
      });
    }
  }

  /** Replaces product-level gallery (variant_id IS NULL) from staged upload_media ids. */
  private async replaceProductMediaFromStaged(
    em: EntityManager,
    workspaceId: number,
    productId: number,
    mediaIds: number[],
    stagedById: Map<number, { cdnUrl: string }>,
  ): Promise<void> {
    await em
      .createQueryBuilder()
      .delete()
      .from(ProductMedia)
      .where('"product_id" = :productId AND "variant_id" IS NULL', {
        productId,
      })
      .execute();
    await this.insertProductMediaFromStaged(
      em,
      workspaceId,
      productId,
      null,
      mediaIds,
      stagedById,
    );
  }

  /** Replaces a variant gallery from staged upload_media ids (same semantics as POST create). */
  private async replaceVariantMediaFromStaged(
    em: EntityManager,
    workspaceId: number,
    productId: number,
    variantId: number,
    mediaIds: number[],
    stagedById: Map<number, { cdnUrl: string }>,
  ): Promise<void> {
    await em
      .createQueryBuilder()
      .delete()
      .from(ProductMedia)
      .where('"variant_id" = :variantId', { variantId })
      .execute();
    await this.insertProductMediaFromStaged(
      em,
      workspaceId,
      productId,
      variantId,
      mediaIds,
      stagedById,
    );
  }

  private async applyProductFieldUpdates(
    workspaceId: number,
    product: Product,
    ownerId: number,
    dto: UpdateProductDto,
    em?: EntityManager,
  ): Promise<void> {
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException("name must not be empty");
      }
      product.name = name;
    }
    if (dto.description !== undefined) {
      product.description =
        dto.description === null ? null : dto.description.trim() || null;
    }
    if (dto.status !== undefined) {
      product.status = dto.status;
    }
    if (dto.productType !== undefined) {
      product.productType = dto.productType;
    }
    if (dto.sourceType !== undefined) {
      product.sourceType = dto.sourceType;
    }
    if (dto.price !== undefined) {
      product.price = dto.price;
    }
    if (dto.currency !== undefined) {
      const c = dto.currency.trim();
      if (!c) {
        throw new BadRequestException("currency must not be empty");
      }
      product.currency = c.slice(0, 8);
    }
    if (dto.inStock !== undefined) {
      product.inStock = dto.inStock;
    }
    if (dto.quantity !== undefined) {
      assertNoDirectQuantityEdit(
        this.inventoryModeOf(
          await this.workspaceContext.requireWorkspaceForOwner(ownerId),
        ),
        dto.quantity,
      );
    }
    if (dto.weightGrams !== undefined) {
      product.weightGrams = dto.weightGrams;
    }
    if (dto.lengthCm !== undefined) {
      product.lengthCm = dto.lengthCm;
    }
    if (dto.widthCm !== undefined) {
      product.widthCm = dto.widthCm;
    }
    if (dto.heightCm !== undefined) {
      product.heightCm = dto.heightCm;
    }
    if (dto.mediaIds !== undefined) {
      const stagedById =
        dto.mediaIds.length > 0
          ? await this.uploadMedia.requireForWorkspace(
              workspaceId,
              dto.mediaIds,
            )
          : new Map<number, UploadMedia>();
      const manager = em ?? this.productRepo.manager;
      await this.replaceProductMediaFromStaged(
        manager,
        workspaceId,
        product.id,
        dto.mediaIds,
        stagedById,
      );
    }
    if (dto.categoryId !== undefined) {
      if (dto.categoryId !== null) {
        await this.assertCategoryBelongsToWorkspaceIfSet(
          workspaceId,
          dto.categoryId,
        );
      }
      product.categoryId = dto.categoryId;
    }

    product.updatedByUserId = ownerId;
    if (em) {
      await em.save(product);
    } else {
      await this.productRepo.save(product);
    }
  }

  private async syncProductVariants(
    em: EntityManager,
    workspace: Workspace,
    product: Product,
    ownerId: number,
    variantInputs: UpdateProductVariantSyncDto[],
  ): Promise<Array<{ variantId: number; quantity: number | undefined }>> {
    const newVariantQuantities: Array<{
      variantId: number;
      quantity: number | undefined;
    }> = [];
    const workspaceId = workspace.id;
    const productType = product.productType;
    if (productType === ProductType.variants && variantInputs.length === 0) {
      throw new BadRequestException(
        "At least one variant is required when product_type is variants",
      );
    }
    if (productType === ProductType.single && variantInputs.length !== 1) {
      throw new BadRequestException(
        "product_type single requires exactly one variant",
      );
    }

    const existing = await em.find(ProductVariant, {
      where: { productId: product.id },
    });
    const existingById = new Map(existing.map((v) => [v.id, v]));
    const payloadIds = new Set<number>();
    for (const spec of variantInputs) {
      if (spec.id != null) {
        if (!existingById.has(spec.id)) {
          throw new BadRequestException(
            `Variant id ${spec.id} does not belong to this product`,
          );
        }
        if (payloadIds.has(spec.id)) {
          throw new BadRequestException(
            `Duplicate variant id ${spec.id} in variants payload`,
          );
        }
        payloadIds.add(spec.id);
      }
    }

    const orderLinkedVariantIds = await this.findVariantIdsReferencedByOrders(
      product.id,
      em,
    );
    const toRemove = existing.filter((v) => !payloadIds.has(v.id));
    await this.archiveOrRemoveVariants(
      em,
      toRemove,
      orderLinkedVariantIds,
      ownerId,
    );

    const stagedMediaIds =
      this.collectStagedMediaIdsFromVariantSync(variantInputs);
    const stagedById = stagedMediaIds.length
      ? await this.uploadMedia.requireForWorkspace(workspaceId, stagedMediaIds)
      : new Map<number, { cdnUrl: string }>();

    for (const spec of variantInputs) {
      if (spec.id != null) {
        const variant = existingById.get(spec.id);
        if (!variant) {
          continue;
        }
        await this.applyVariantSyncInput(
          em,
          workspace,
          product.id,
          variant,
          spec,
          ownerId,
          stagedById,
        );
      } else {
        const resolved =
          await this.variantCustomFields.resolveVariantAttributesFromPayload(
            ownerId,
            workspaceId,
            spec.customFields,
            em,
          );
        const variant = await em.save(
          em.create(ProductVariant, {
            productId: product.id,
            price: spec.price ?? null,
            inStock: spec.inStock ?? null,
            sku: spec.sku?.trim() || null,
            status: spec.status ?? product.status,
            createdByUserId: ownerId,
            updatedByUserId: null,
          }),
        );
        await this.variantCustomFields.upsertValuesForVariant(
          em,
          variant.id,
          resolved,
        );
        await this.replaceVariantMediaFromStaged(
          em,
          workspaceId,
          product.id,
          variant.id,
          spec.mediaIds ?? [],
          stagedById,
        );
        newVariantQuantities.push({
          variantId: variant.id,
          quantity: spec.quantity,
        });
      }
    }
    return newVariantQuantities;
  }

  private collectStagedMediaIdsFromVariantSync(
    variants: UpdateProductVariantSyncDto[],
  ): number[] {
    const ids = new Set<number>();
    for (const spec of variants) {
      for (const id of spec.mediaIds ?? []) {
        ids.add(id);
      }
    }
    return [...ids];
  }

  private async applyVariantSyncInput(
    em: EntityManager,
    workspace: Workspace,
    productId: number,
    variant: ProductVariant,
    spec: UpdateProductVariantSyncDto,
    ownerId: number,
    stagedById: Map<number, { cdnUrl: string }>,
  ): Promise<void> {
    if (spec.customFields !== undefined) {
      const resolved =
        await this.variantCustomFields.resolveVariantAttributesFromPayload(
          ownerId,
          workspace.id,
          spec.customFields,
          em,
        );
      await this.variantCustomFields.upsertValuesForVariant(
        em,
        variant.id,
        resolved,
      );
    }
    if (spec.price !== undefined) {
      variant.price = spec.price;
    }
    if (spec.inStock !== undefined) {
      variant.inStock = spec.inStock;
    }
    if (spec.quantity !== undefined) {
      await this.applySimpleQuantityIfProvided(
        ownerId,
        workspace,
        variant.id,
        spec.quantity,
      );
    }
    if (spec.sku !== undefined) {
      variant.sku = spec.sku?.trim() || null;
    }
    if (spec.status !== undefined) {
      variant.status = spec.status;
    }
    variant.updatedByUserId = ownerId;
    await em.save(variant);

    await this.replaceVariantMediaFromStaged(
      em,
      workspace.id,
      productId,
      variant.id,
      spec.mediaIds ?? [],
      stagedById,
    );
  }

  private async findVariantIdsReferencedByOrders(
    productId: number,
    em?: EntityManager,
  ): Promise<Set<number>> {
    const repo = em ? em.getRepository(OrderItem) : this.orderItemRepo;
    const rows = await repo.find({
      where: { productId },
      select: ["variantId"],
    });
    return new Set(
      rows
        .map((r) => r.variantId)
        .filter((id): id is number => id != null && id > 0),
    );
  }

  private async collectUploadMediaIdsForProduct(
    productId: number,
  ): Promise<number[]> {
    const rows = await this.mediaRepo.find({
      where: { productId },
      select: ["uploadMediaId"],
    });
    return [
      ...new Set(
        rows
          .map((r) => r.uploadMediaId)
          .filter((id): id is number => id != null && id > 0),
      ),
    ];
  }

  private async collectUploadMediaIdsForVariant(
    productId: number,
    variantId: number,
  ): Promise<number[]> {
    const rows = await this.mediaRepo.find({
      where: { productId, variantId },
      select: ["uploadMediaId"],
    });
    return [
      ...new Set(
        rows
          .map((r) => r.uploadMediaId)
          .filter((id): id is number => id != null && id > 0),
      ),
    ];
  }

  private async archiveOrRemoveVariants(
    em: EntityManager,
    variants: ProductVariant[],
    orderLinkedVariantIds: Set<number>,
    ownerId: number,
  ): Promise<void> {
    for (const variant of variants) {
      if (orderLinkedVariantIds.has(variant.id)) {
        variant.status = ProductStatus.archived;
        variant.updatedByUserId = ownerId;
        await em.save(variant);
      } else {
        await em.remove(variant);
      }
    }
  }

  private async requireProduct(
    workspaceId: number,
    productId: number,
  ): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id: productId, workspaceId },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }
    return product;
  }

  private async assertCanAddVariantToProduct(product: Product): Promise<void> {
    if (product.productType !== ProductType.single) {
      return;
    }
    const variantCount = await this.variantRepo.count({
      where: { productId: product.id },
    });
    if (variantCount >= 1) {
      throw new BadRequestException(
        "Products with product_type single allow only one variant",
      );
    }
  }

  private async assertCategoryBelongsToWorkspaceIfSet(
    workspaceId: number,
    categoryId: number | null | undefined,
  ): Promise<void> {
    if (categoryId == null) {
      return;
    }
    const ok = await this.categoryRepo.exist({
      where: {
        id: categoryId,
        workspaceId,
        deletedAt: IsNull(),
      },
    });
    if (!ok) {
      throw new BadRequestException(
        "Category is invalid or not in your workspace",
      );
    }
  }

  private async parseAndValidateCategoryIdsForList(
    workspaceId: number,
    query: ListProductsQueryDto,
  ): Promise<number[] | undefined> {
    if (!query.categoryIds) {
      return undefined;
    }
    const categoryIdFilter = [
      ...new Set(
        query.categoryIds.split(",").map((s) => Number.parseInt(s.trim(), 10)),
      ),
    ];
    await this.assertCategoriesInWorkspace(workspaceId, categoryIdFilter);
    return categoryIdFilter;
  }

  private applyCatalogVariantFilters(
    qb: SelectQueryBuilder<ProductVariant>,
    workspaceId: number,
    productStatus: ProductStatus,
    searchText: string | undefined,
  ): void {
    qb.where("p.workspaceId = :workspaceId", { workspaceId });
    qb.andWhere("p.status = :productStatus", { productStatus });

    if (searchText) {
      const pattern = `%${escapePgIlikePattern(searchText)}%`;
      qb.andWhere(
        `(
          p.name ILIKE :catalogSearch ESCAPE '\\'
          OR COALESCE(v.sku, '') ILIKE :catalogSearch ESCAPE '\\'
          OR EXISTS (
            SELECT 1 FROM product_variant_custom_field_value cfv
            WHERE cfv.variant_id = v.id
              AND cfv.value ILIKE :catalogSearch ESCAPE '\\'
          )
        )`,
        { catalogSearch: pattern },
      );
    }
  }

  private toCatalogVariantItem(
    v: ProductVariant,
    fieldDefs: WorkspaceVariantCustomField[],
    mainImageByProductId: Map<number, string>,
    stockMap: Map<number, VariantStockDto>,
    wishlistCountByVariantId?: Map<number, number>,
  ): CatalogVariantListResponseDto["items"][number] {
    const p = v.product;
    if (p == null) {
      throw new Error("ProductVariant row missing product (invariant)");
    }
    const productMainImage = this.resolveMainImageUrl(p, mainImageByProductId);
    const variantTitle = buildVariantTitleFromFields(fieldDefs, v);
    const label = variantTitle ? `${p.name} — ${variantTitle}` : p.name;
    const unitPrice = v.price ?? p.price ?? null;
    const variantImage = pickMainMediaUrl(v.media ?? []);
    const imageUrl = variantImage || productMainImage;
    const stock = stockMap.get(v.id);
    if (!stock) {
      throw new Error(`Missing stock snapshot for variant ${v.id}`);
    }

    return {
      id: v.id,
      productId: p.id,
      customFields: serializeVariantCustomFields(v, fieldDefs),
      sku: v.sku,
      unitPrice,
      imageUrl,
      inStock: v.inStock ?? p.inStock,
      ...presentProductStockFields(stock),
      status: v.status,
      wishlistCount: wishlistCountByVariantId?.get(v.id) ?? 0,
      label,
      product: {
        id: p.id,
        name: p.name,
        categoryId: p.categoryId,
        mainImageUrl: productMainImage,
        currency: p.currency,
        status: p.status,
        price: p.price,
      },
    };
  }

  private applyVariantListFilters(
    qb: SelectQueryBuilder<ProductVariant>,
    workspaceId: number,
    categoryIdFilter: number[] | undefined,
    query: ListProductsQueryDto,
  ): void {
    qb.where("p.workspaceId = :workspaceId", { workspaceId });
    this.applyProductStatusFilter(qb, query);
    if (query.wishlistOnly === true) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM client_wishlist_items w
          WHERE w.product_id = p.id
            AND w.workspace_id = :wishlistWorkspaceId
        )`,
        { wishlistWorkspaceId: workspaceId },
      );
    }
    if (categoryIdFilter != null && categoryIdFilter.length > 0) {
      qb.andWhere("p.categoryId IN (:...catIds)", { catIds: categoryIdFilter });
    }
    const minP = query.minPrice;
    const maxP = query.maxPrice;
    if (minP !== undefined && maxP !== undefined) {
      qb.andWhere("p.price BETWEEN :minP AND :maxP", { minP, maxP });
    } else if (minP !== undefined) {
      qb.andWhere("p.price >= :minP", { minP });
    } else if (maxP !== undefined) {
      qb.andWhere("p.price <= :maxP", { maxP });
    }
    const keyword = query.keyword?.trim();
    if (keyword) {
      qb.andWhere("p.name ILIKE :nameKeyword ESCAPE '\\'", {
        nameKeyword: `%${escapePgIlikePattern(keyword)}%`,
      });
    }
  }

  private applyProductStatusFilter(
    qb: SelectQueryBuilder<Product | ProductVariant>,
    query: ListProductsQueryDto,
  ): void {
    const byStatus = query.byStatus ?? ProductListByStatus.all;
    if (byStatus === ProductListByStatus.onlyActive) {
      qb.andWhere("p.status = :byStatusActive", {
        byStatusActive: ProductStatus.active,
      });
      return;
    }
    if (byStatus === ProductListByStatus.onlyArchived) {
      qb.andWhere("p.status = :byStatusArchived", {
        byStatusArchived: ProductStatus.archived,
      });
      return;
    }
    if (query.status !== undefined) {
      qb.andWhere("p.status = :status", { status: query.status });
    }
  }

  private async assertCategoriesInWorkspace(
    workspaceId: number,
    categoryIds: number[],
  ): Promise<void> {
    if (categoryIds.length === 0) {
      return;
    }
    const count = await this.categoryRepo.count({
      where: {
        id: In(categoryIds),
        workspaceId,
        deletedAt: IsNull(),
      },
    });
    if (count !== categoryIds.length) {
      throw new BadRequestException(
        "One or more category ids are invalid, deleted, or not in your workspace",
      );
    }
  }

  private async loadFirstProductLevelMediaUrls(
    productIds: number[],
  ): Promise<Map<number, string>> {
    if (productIds.length === 0) {
      return new Map();
    }
    const rows = await this.mediaRepo.find({
      where: {
        productId: In(productIds),
        variantId: IsNull(),
      },
      order: { sortOrder: "ASC", id: "ASC" },
    });
    const map = new Map<number, string>();
    for (const row of rows) {
      if (map.has(row.productId)) {
        continue;
      }
      const url = row.url?.trim();
      if (url) {
        map.set(row.productId, url);
      }
    }
    return map;
  }

  private resolveMainImageUrl(
    product: Product,
    cached?: Map<number, string>,
  ): string | null {
    const fromCache = cached?.get(product.id);
    if (fromCache) {
      return fromCache;
    }
    return this.firstProductLevelMediaUrlFromLoaded(product);
  }

  private firstProductLevelMediaUrlFromLoaded(product: Product): string | null {
    const items = (product.media ?? []).filter((m) => m.variantId == null);
    return pickMainMediaUrl(items);
  }

  private toListItem(
    p: Product,
    mainImageByProductId?: Map<number, string>,
    stockMap?: Map<number, VariantStockDto>,
    wishlistCountByProductId?: Map<number, number>,
  ): ProductListItemBaseDto {
    const variantIds = (p.variants ?? []).map((v) => v.id);
    const quantity =
      stockMap && variantIds.length > 0
        ? variantIds.reduce(
            (sum, id) => sum + (stockMap.get(id)?.quantity ?? 0),
            0,
          )
        : null;
    return {
      id: p.id,
      name: p.name,
      productType: p.productType,
      status: p.status,
      price: p.price,
      currency: p.currency,
      inStock: p.inStock,
      quantity,
      wishlistCount: wishlistCountByProductId?.get(p.id) ?? 0,
      mainImageUrl: this.resolveMainImageUrl(p, mainImageByProductId),
      categoryId: p.categoryId,
      weightGrams: p.weightGrams,
      lengthCm: p.lengthCm,
      widthCm: p.widthCm,
      heightCm: p.heightCm,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  private async loadWishlistCountByProductId(
    workspaceId: number,
    productIds: number[],
  ): Promise<Map<number, number>> {
    if (productIds.length === 0) {
      return new Map();
    }

    const rows = await this.clientWishlistRepo
      .createQueryBuilder("w")
      .select("w.product_id", "productId")
      .addSelect("COUNT(DISTINCT w.client_id)", "wishlistCount")
      .where("w.workspace_id = :workspaceId", { workspaceId })
      .andWhere("w.product_id IN (:...productIds)", { productIds })
      .groupBy("w.product_id")
      .getRawMany<{ productId: string; wishlistCount: string }>();

    return new Map(
      rows.map((row) => [Number(row.productId), Number(row.wishlistCount)]),
    );
  }

  private async loadWishlistCountByVariantId(
    workspaceId: number,
    variantIds: number[],
  ): Promise<Map<number, number>> {
    if (variantIds.length === 0) {
      return new Map();
    }

    const rows = await this.clientWishlistRepo
      .createQueryBuilder("w")
      .select("w.variant_id", "variantId")
      .addSelect("COUNT(DISTINCT w.client_id)", "wishlistCount")
      .where("w.workspace_id = :workspaceId", { workspaceId })
      .andWhere("w.variant_id IN (:...variantIds)", { variantIds })
      .groupBy("w.variant_id")
      .getRawMany<{ variantId: string; wishlistCount: string }>();

    return new Map(
      rows.map((row) => [Number(row.variantId), Number(row.wishlistCount)]),
    );
  }

  private toProductParentSummary(
    p: Product,
    mainImageByProductId?: Map<number, string>,
  ): ProductParentSummaryDto {
    return {
      id: p.id,
      name: p.name,
      productType: p.productType,
      categoryId: p.categoryId,
      mainImageUrl: this.resolveMainImageUrl(p, mainImageByProductId),
      currency: p.currency,
      status: p.status,
    };
  }

  /**
   * Products referenced for an Instagram post, grouped by product with `referenceId` on each variant.
   * Variant-specific references include only that variant; product-level references include all variants
   * (same `referenceId` on each). Variant-specific rows take precedence when both exist.
   */
  async listListItemsForInstagramReferences(
    ownerId: number,
    references: Array<{
      referenceId: number;
      productId: number;
      productVariantId: number | null;
    }>,
  ): Promise<InstagramReferencedProductListItemDto[]> {
    if (references.length === 0) {
      return [];
    }

    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const productIds = [...new Set(references.map((r) => r.productId))];
    const loaded = await this.productRepo.find({
      where: { id: In(productIds), workspaceId: workspace.id },
      relations: {
        variants: { customFieldValues: true },
        media: true,
      },
    });
    if (loaded.length === 0) {
      return [];
    }

    const productById = new Map(loaded.map((p) => [p.id, p]));
    const refsByProductId = new Map<
      number,
      Array<{
        referenceId: number;
        productId: number;
        productVariantId: number | null;
      }>
    >();
    for (const ref of references) {
      const list = refsByProductId.get(ref.productId) ?? [];
      list.push(ref);
      refsByProductId.set(ref.productId, list);
    }

    const fieldDefs =
      await this.variantCustomFields.listDefinitionsForWorkspace(workspace.id);
    const mainImageByProductId =
      await this.loadFirstProductLevelMediaUrls(productIds);
    const allVariantIds = loaded.flatMap((p) =>
      (p.variants ?? []).map((v) => v.id),
    );
    const stockMap = await this.inventory.getStockMapForVariantIds(
      workspace.id,
      allVariantIds,
    );
    const wishlistCountByProductId = await this.loadWishlistCountByProductId(
      workspace.id,
      productIds,
    );
    const wishlistCountByVariantId = await this.loadWishlistCountByVariantId(
      workspace.id,
      allVariantIds,
    );

    const items: InstagramReferencedProductListItemDto[] = [];
    for (const productId of [...refsByProductId.keys()].sort((a, b) => a - b)) {
      const p = productById.get(productId);
      if (!p) {
        continue;
      }
      const productRefs = refsByProductId.get(productId) ?? [];
      const variantById = new Map<number, InstagramReferencedVariantDto>();

      for (const ref of productRefs) {
        if (ref.productVariantId == null) {
          continue;
        }
        const [variant] = this.buildVariantDtos(
          p,
          fieldDefs,
          stockMap,
          {
            includeAllVariants: false,
            variantIds: new Set([ref.productVariantId]),
          },
          wishlistCountByVariantId,
        );
        if (variant) {
          variantById.set(variant.id, {
            ...variant,
            referenceId: ref.referenceId,
          });
        }
      }

      for (const ref of productRefs) {
        if (ref.productVariantId != null) {
          continue;
        }
        for (const variant of this.buildVariantDtos(
          p,
          fieldDefs,
          stockMap,
          undefined,
          wishlistCountByVariantId,
        )) {
          if (!variantById.has(variant.id)) {
            variantById.set(variant.id, {
              ...variant,
              referenceId: ref.referenceId,
            });
          }
        }
      }

      if (variantById.size === 0) {
        continue;
      }

      items.push({
        ...this.toListItem(
          p,
          mainImageByProductId,
          stockMap,
          wishlistCountByProductId,
        ),
        variants: [...variantById.values()].sort((a, b) => a.id - b.id),
      });
    }
    return items;
  }

  private buildVariantDtos(
    p: Product,
    fieldDefs: WorkspaceVariantCustomField[],
    stockMap: Map<number, VariantStockDto>,
    variantFilter?: {
      includeAllVariants: boolean;
      variantIds: Set<number>;
    },
    wishlistCountByVariantId?: Map<number, number>,
  ): ProductVariantDto[] {
    let variants = [...(p.variants ?? [])].sort((a, b) => a.id - b.id);
    if (variantFilter && !variantFilter.includeAllVariants) {
      variants = variants.filter((v) => variantFilter.variantIds.has(v.id));
    }
    const allMedia = [...(p.media ?? [])];
    const mediaByVariant = new Map<number, ProductMedia[]>();
    for (const m of allMedia) {
      if (m.variantId != null) {
        const list = mediaByVariant.get(m.variantId) ?? [];
        list.push(m);
        mediaByVariant.set(m.variantId, list);
      }
    }
    return variants.map((v) => {
      const stock = stockMap.get(v.id);
      if (!stock) {
        throw new Error(`Missing stock snapshot for variant ${v.id}`);
      }
      const vMedia = (mediaByVariant.get(v.id) ?? []).sort(mediaSort);
      const variantImage = pickMainMediaUrl(vMedia);
      return {
        id: v.id,
        customFields: serializeVariantCustomFields(v, fieldDefs),
        price: v.price,
        inStock: v.inStock,
        ...presentProductStockFields(stock),
        imageUrl: variantImage,
        sku: v.sku,
        status: v.status,
        wishlistCount: wishlistCountByVariantId?.get(v.id) ?? 0,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
        media: vMedia.map((m) => this.toMediaDto(m)),
      };
    });
  }

  private toVariantListItem(
    v: ProductVariant,
    fieldDefs: WorkspaceVariantCustomField[],
    mainImageByProductId: Map<number, string>,
    stockMap: Map<number, VariantStockDto>,
    wishlistCountByVariantId?: Map<number, number>,
  ): ProductVariantListItemDto {
    const p = v.product;
    if (p == null) {
      throw new Error("ProductVariant row missing product (invariant)");
    }
    const stock = stockMap.get(v.id);
    if (!stock) {
      throw new Error(`Missing stock snapshot for variant ${v.id}`);
    }
    const media = [...(v.media ?? [])].sort(mediaSort);
    const variantImage = pickMainMediaUrl(media);
    return {
      id: v.id,
      customFields: serializeVariantCustomFields(v, fieldDefs),
      price: v.price,
      inStock: v.inStock,
      ...presentProductStockFields(stock),
      imageUrl: variantImage,
      sku: v.sku,
      status: v.status,
      wishlistCount: wishlistCountByVariantId?.get(v.id) ?? 0,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      media: media.map((m) => this.toMediaDto(m)),
      categoryId: p.categoryId,
      name: p.name,
      product_parent: this.toProductParentSummary(p, mainImageByProductId),
    };
  }

  private normalizeCreateVariantInputs(
    dto: CreateProductDto,
    productType: ProductType,
  ): CreateProductVariantInputDto[] {
    const specs = dto.variants ?? [];
    if (productType === ProductType.single) {
      if (specs.length === 0) {
        return [this.mergeProductFieldsIntoVariantSpec(dto, {})];
      }
      if (specs.length === 1) {
        return [this.mergeProductFieldsIntoVariantSpec(dto, specs[0])];
      }
      throw new BadRequestException(
        "product_type single allows at most one variant",
      );
    }
    return specs;
  }

  private mergeProductFieldsIntoVariantSpec(
    dto: Pick<CreateProductDto, "price" | "inStock" | "quantity" | "status">,
    spec: CreateProductVariantInputDto,
  ): CreateProductVariantInputDto {
    return {
      ...spec,
      price: spec.price ?? dto.price,
      inStock: spec.inStock ?? dto.inStock,
      quantity: spec.quantity ?? dto.quantity,
      status: spec.status ?? dto.status,
    };
  }

  private async applySingleProductQuantityFromDto(
    ownerId: number,
    workspace: Workspace,
    product: Product,
    quantity: number | null | undefined,
  ): Promise<void> {
    if (quantity === undefined || product.productType !== ProductType.single) {
      return;
    }
    const variant = await this.variantRepo.findOne({
      where: { productId: product.id },
      order: { id: "ASC" },
    });
    if (!variant) {
      return;
    }
    await this.applySimpleQuantityIfProvided(
      ownerId,
      workspace,
      variant.id,
      quantity,
    );
  }

  private inventoryModeOf(workspace: {
    inventoryMode?: InventoryMode;
  }): InventoryMode {
    return workspace.inventoryMode ?? InventoryMode.simple;
  }

  private async applySimpleQuantityIfProvided(
    ownerId: number,
    workspace: { inventoryMode?: InventoryMode },
    variantId: number,
    quantity: number | null | undefined,
  ): Promise<void> {
    if (quantity === undefined) {
      return;
    }
    assertNoDirectQuantityEdit(this.inventoryModeOf(workspace), quantity);
    if (
      this.inventoryModeOf(workspace) === InventoryMode.simple &&
      quantity != null
    ) {
      await this.inventory.setSimpleQuantity(ownerId, {
        variantId,
        quantity,
      });
    }
  }

  private toMediaDto(m: ProductMedia): ProductMediaDto {
    return {
      id: m.id,
      productId: m.productId,
      variantId: m.variantId,
      uploadMediaId: m.uploadMediaId,
      url: m.url,
      type: m.type,
      sourceUrl: m.sourceUrl,
      sortOrder: m.sortOrder,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  private toDetail(
    p: Product,
    fieldDefs: WorkspaceVariantCustomField[],
    stockMap: Map<number, VariantStockDto>,
    wishlistCountByProductId?: Map<number, number>,
    wishlistCountByVariantId?: Map<number, number>,
  ): ProductDetailDto {
    const allMedia = [...(p.media ?? [])];
    const productLevelMedia = allMedia
      .filter((m) => m.variantId == null)
      .sort(mediaSort);
    const categoryNode = p.category;
    const categorySummary: ProductCategorySummaryDto | null = categoryNode
      ? {
          id: categoryNode.id,
          name: categoryNode.name,
          parentId: categoryNode.parentId,
        }
      : null;

    return {
      ...this.toListItem(p, undefined, stockMap, wishlistCountByProductId),
      description: p.description,
      sourceType: p.sourceType,
      createdByUserId: p.createdByUserId,
      updatedByUserId: p.updatedByUserId,
      category: categorySummary,
      variants: this.buildVariantDtos(
        p,
        fieldDefs,
        stockMap,
        undefined,
        wishlistCountByVariantId,
      ),
      media: productLevelMedia.map((m) => this.toMediaDto(m)),
    };
  }
}
