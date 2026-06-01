import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository, type EntityManager, type SelectQueryBuilder } from "typeorm";
import {
  InstagramIntegration,
  Product,
  ProductCategory,
  ProductMedia,
  ProductSourceReference,
  ProductVariant,
  UploadMedia,
  WorkspaceVariantCustomField,
  OrderItem,
} from "../database/entities";
import { ProductMediaType } from "../database/entities/product-media-type.enum";
import { ProductSourceReferenceType } from "../database/entities/product-source-reference-type.enum";
import { ProductSourceType } from "../database/entities/product-source-type.enum";
import { ProductStatus } from "../database/entities/product-status.enum";
import { ProductType } from "../database/entities/product-type.enum";
import type { CreateProductDto } from "./dto/create-product.dto";
import type { CreateProductMediaDto } from "./dto/create-product-media.dto";
import type { CreateProductSourceReferenceDto } from "./dto/create-product-source-reference.dto";
import type { CreateProductVariantInputDto } from "./dto/create-product-variant-input.dto";
import type { UpdateProductVariantSyncDto } from "./dto/update-product-variant-sync.dto";
import type { CreateProductVariantDto } from "./dto/create-product-variant.dto";
import type { CatalogVariantListResponseDto } from "./dto/catalog-variant-list-response.dto";
import type { ListCatalogVariantsQueryDto } from "./dto/list-catalog-variants-query.dto";
import type { ListProductsQueryDto } from "./dto/list-products-query.dto";
import { ProductListSort } from "./dto/product-list-sort.enum";
import type { UpdateProductDto } from "./dto/update-product.dto";
import type { UpdateProductMediaDto } from "./dto/update-product-media.dto";
import type { UpdateProductVariantDto } from "./dto/update-product-variant.dto";
import { WorkspaceSettingsService } from "../workspace-settings/workspace-settings.service";
import {
  expandVariantColorSize,
  mergeAnalysisDescription,
  tryParsePriceFromOfferText,
} from "./instagram-analysis-draft.util";
import { ProductMediaService } from "./product-media.service";
import { mediaSort, pickMainMediaUrl } from "./product-media.util";
import { UploadMediaService } from "./upload-media.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { VariantCustomFieldsService } from "../variant-custom-fields/variant-custom-fields.service";
import {
  buildVariantTitleFromFields,
  colorSizeSpecToFieldValues,
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
  imageUrl: string | null;
  sku: string | null;
  status: ProductStatus;
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

export type ProductSourceReferenceDto = {
  id: number;
  sourceType: string;
  sourceId: string;
  permalink: string | null;
  caption: string | null;
  createdAt: Date;
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
  mainImageUrl: string | null;
  categoryId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductListItemDto = ProductListItemBaseDto & {
  variants: ProductVariantDto[];
};

export type ProductDetailDto = ProductListItemBaseDto & {
  description: string | null;
  sourceType: string | null;
  createdByUserId: number;
  updatedByUserId: number | null;
  category: ProductCategorySummaryDto | null;
  variants: ProductVariantDto[];
  media: ProductMediaDto[];
  sourceReferences: ProductSourceReferenceDto[];
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

/** Neutral payload from Instagram (or other) analysis — keeps `products` free of Instagram imports. */
export type CatalogProductFromAnalysisParams = {
  instagramMediaId: string;
  mainImageUrl: string;
  sourceType: ProductSourceType;
  permalink: string | null;
  caption: string | null;
  name: string;
  shortDescription: string;
  longDescription: string;
  colors: string[];
  sizes: string[];
  visiblePriceOrOffer: string | null;
  matchedCategoryId: number | null;
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
    @InjectRepository(ProductSourceReference)
    private readonly sourceRefRepo: Repository<ProductSourceReference>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepo: Repository<ProductCategory>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    private readonly productMedia: ProductMediaService,
    private readonly uploadMedia: UploadMediaService,
    private readonly variantCustomFields: VariantCustomFieldsService,
    private readonly workspaceSettings: WorkspaceSettingsService,
    private readonly workspaceContext: WorkspaceAccessContextService,
  ) {}

  async getWorkspaceIdForOwner(ownerId: number): Promise<number> {
    return this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
  }

  /** Used when Instagram source-reference rows or Graph context is required. */
  async getIntegrationForOwner(ownerId: number): Promise<InstagramIntegration> {
    return this.workspaceContext.requireInstagramIntegrationForOwner(ownerId);
  }

  async listForOwner(
    ownerId: number,
    query: ListProductsQueryDto,
  ): Promise<ProductListResponseDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
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
    if (query.status !== undefined) {
      qb.andWhere("p.status = :status", { status: query.status });
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
    const fieldDefs = await this.variantCustomFields.listDefinitionsForWorkspace(
      workspace.id,
    );
    const mainImageByProductId = await this.loadFirstProductLevelMediaUrls(
      productIds,
    );

    return {
      items: rows.map((row) => {
        const p = byId.get(row.id) ?? row;
        return {
          ...this.toListItem(p, mainImageByProductId),
          variants: this.buildVariantDtos(p, fieldDefs),
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
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
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
    const fieldDefs = await this.variantCustomFields.listDefinitionsForWorkspace(
      workspace.id,
    );
    const mainImageByProductId = await this.loadFirstProductLevelMediaUrls(
      [...new Set(rows.map((v) => v.productId))],
    );

    return {
      items: rows.map((v) =>
        this.toCatalogVariantItem(v, fieldDefs, mainImageByProductId),
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
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
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
    this.applyVariantListFilters(countQb, workspace.id, categoryIdFilter, query);
    const total = await countQb.getCount();

    const dataQb = this.variantRepo
      .createQueryBuilder("v")
      .innerJoinAndSelect("v.product", "p")
      .leftJoinAndSelect("v.media", "m")
      .leftJoinAndSelect("v.customFieldValues", "cfv");
    this.applyVariantListFilters(dataQb, workspace.id, categoryIdFilter, query);
    applyVariantListSort(dataQb, query.sort);
    const rows = await dataQb.skip(offset).take(limit).getMany();
    const fieldDefs = await this.variantCustomFields.listDefinitionsForWorkspace(
      workspace.id,
    );
    const mainImageByProductId = await this.loadFirstProductLevelMediaUrls(
      [...new Set(rows.map((v) => v.productId))],
    );

    return {
      items: rows.map((v) =>
        this.toVariantListItem(v, fieldDefs, mainImageByProductId),
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
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const product = await this.productRepo.findOne({
      where: { id: productId, workspaceId: workspace.id },
      relations: {
        category: true,
        variants: { customFieldValues: true },
        media: true,
        sourceReferences: true,
      },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }
    const fieldDefs = await this.variantCustomFields.listDefinitionsForWorkspace(
      workspace.id,
    );
    return this.toDetail(product, fieldDefs);
  }

  async createForOwner(ownerId: number, dto: CreateProductDto): Promise<void> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
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
    const variantInputs = dto.variants ?? [];

    if (productType === ProductType.variants && variantInputs.length === 0) {
      throw new BadRequestException(
        "At least one variant is required when product_type is variants",
      );
    }
    if (productType === ProductType.single && variantInputs.length > 1) {
      throw new BadRequestException(
        "product_type single allows at most one variant",
      );
    }

    const stagedMediaIds = this.collectStagedMediaIds(dto);
    const stagedById = await this.uploadMedia.requireForWorkspace(
      workspace.id,
      stagedMediaIds,
    );
    const fieldDefs = await this.variantCustomFields.listDefinitionsForWorkspace(
      workspace.id,
    );

    await this.productRepo.manager.transaction(async (em) => {
      const product = em.create(Product, {
        workspaceId: workspace.id,
        categoryId: dto.categoryId ?? null,
        name,
        description: dto.description?.trim() || null,
        status: dto.status ?? ProductStatus.draft,
        productType,
        sourceType: dto.sourceType ?? null,
        price: dto.price ?? null,
        currency: (dto.currency?.trim() || defaultCurrency).slice(0, 8),
        inStock: dto.inStock ?? null,
        quantity: dto.quantity ?? null,
        createdByUserId: ownerId,
        updatedByUserId: null,
      });
      const saved = await em.save(product);

      for (const spec of variantInputs) {
        const resolved = this.variantCustomFields.resolveVariantStorage(
          fieldDefs,
          { customFields: spec.customFields },
        );
        const variant = await em.save(
          em.create(ProductVariant, {
            productId: saved.id,
            price: spec.price ?? null,
            inStock: spec.inStock ?? null,
            quantity: spec.quantity ?? null,
            sku: spec.sku?.trim() || null,
            status: spec.status ?? ProductStatus.draft,
            createdByUserId: ownerId,
            updatedByUserId: null,
          }),
        );
        await this.variantCustomFields.upsertValuesForVariant(
          em,
          variant.id,
          resolved,
        );

        if (spec.mediaIds?.length) {
          await this.insertProductMediaFromStaged(
            em,
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
          saved.id,
          null,
          dto.mediaIds,
          stagedById,
        );
      }
    });
  }

  /**
   * Creates a draft catalog product from vision/text analysis: variants = colors × sizes
   * (or a single row when both lists are empty), optional category, and a source reference row.
   */
  async createDraftFromInstagramAnalysis(
    ownerId: number,
    params: CatalogProductFromAnalysisParams,
  ): Promise<ProductDetailDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const integration =
      await this.workspaceContext.requireInstagramIntegrationForOwner(ownerId);
    const defaultCurrency =
      await this.workspaceSettings.getDefaultCurrencyForOwner(ownerId);
    const name = params.name.trim().slice(0, 512);
    if (!name) {
      throw new BadRequestException("Product name is required");
    }
    await this.assertCategoryBelongsToWorkspaceIfSet(
      workspace.id,
      params.matchedCategoryId,
    );

    const description = mergeAnalysisDescription(
      params.shortDescription,
      params.longDescription,
    );
    const price = tryParsePriceFromOfferText(params.visiblePriceOrOffer);
    const variantSpecs = expandVariantColorSize(params.colors, params.sizes);
    const fieldDefs = await this.variantCustomFields.listDefinitionsForWorkspace(
      workspace.id,
    );
    const refType =
      params.sourceType === ProductSourceType.instagram_story
        ? ProductSourceReferenceType.instagram_story
        : ProductSourceReferenceType.instagram_post;

    let productId = 0;
    await this.productRepo.manager.transaction(async (em) => {
      const product = em.create(Product, {
        workspaceId: workspace.id,
        categoryId: params.matchedCategoryId ?? null,
        name,
        description,
        status: ProductStatus.draft,
        productType:
          variantSpecs.length > 1 ? ProductType.variants : ProductType.single,
        sourceType: params.sourceType,
        price,
        currency: defaultCurrency,
        inStock: null,
        quantity: null,
        createdByUserId: ownerId,
        updatedByUserId: null,
      });
      const saved = await em.save(product);
      productId = saved.id;

      const coverUrl = params.mainImageUrl.trim();
      if (coverUrl) {
        await em.insert(ProductMedia, {
          productId: saved.id,
          variantId: null,
          url: coverUrl,
          type: ProductMediaType.image,
          sourceUrl: null,
          sortOrder: 0,
        });
      }

      const specsToInsert =
        saved.productType === ProductType.single
          ? variantSpecs.slice(0, 1)
          : variantSpecs;

      for (const spec of specsToInsert) {
        const insertResult = await em.insert(ProductVariant, {
          productId: saved.id,
          price: null,
          inStock: null,
          quantity: null,
          sku: null,
          status: ProductStatus.draft,
          createdByUserId: ownerId,
          updatedByUserId: null,
        });
        const variantId = insertResult.identifiers[0].id as number;
        await this.variantCustomFields.upsertValuesForVariant(
          em,
          variantId,
          colorSizeSpecToFieldValues(fieldDefs, spec),
        );
      }

      await em.insert(ProductSourceReference, {
        companyId: integration.id,
        productId: saved.id,
        sourceType: refType,
        sourceId: params.instagramMediaId,
        permalink: params.permalink,
        caption: params.caption,
        createdByUserId: ownerId,
      });
    });

    return this.findOneForOwner(ownerId, productId);
  }

  async updateForOwner(
    ownerId: number,
    productId: number,
    dto: UpdateProductDto,
  ): Promise<ProductDetailDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const product = await this.productRepo.findOne({
      where: { id: productId, workspaceId: workspace.id },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }
    await this.applyProductFieldUpdates(workspace.id, product, ownerId, dto);
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
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const product = await this.productRepo.findOne({
      where: { id: productId, workspaceId: workspace.id },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    await this.productRepo.manager.transaction(async (em) => {
      await this.applyProductFieldUpdates(
        workspace.id,
        product,
        ownerId,
        dto,
        em,
      );
      if (dto.variants !== undefined) {
        await this.syncProductVariants(
          em,
          workspace.id,
          product,
          ownerId,
          dto.variants,
        );
      }
    });

    return this.findOneForOwner(ownerId, productId);
  }

  async removeForOwner(ownerId: number, productId: number): Promise<void> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const product = await this.productRepo.findOne({
      where: { id: productId, workspaceId: workspace.id },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const variants = await this.variantRepo.find({ where: { productId } });
    const orderLinkedVariantIds =
      await this.findVariantIdsReferencedByOrders(productId);

    if (orderLinkedVariantIds.size === 0) {
      await this.productRepo.remove(product);
      return;
    }

    await this.productRepo.manager.transaction(async (em) => {
      await this.archiveOrRemoveVariants(
        em,
        variants,
        orderLinkedVariantIds,
        ownerId,
      );
      product.status = ProductStatus.archived;
      product.updatedByUserId = ownerId;
      await em.save(product);
    });
  }

  async createVariantForOwner(
    ownerId: number,
    productId: number,
    dto: CreateProductVariantDto,
  ): Promise<ProductDetailDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const product = await this.requireProduct(workspace.id, productId);
    await this.assertCanAddVariantToProduct(product);
    const fieldDefs = await this.variantCustomFields.listDefinitionsForWorkspace(
      workspace.id,
    );
    const resolved = this.variantCustomFields.resolveVariantStorage(fieldDefs, {
      customFields: dto.customFields,
    });
    const stagedMediaIds = dto.mediaIds ?? [];
    const stagedById = stagedMediaIds.length
      ? await this.uploadMedia.requireForWorkspace(workspace.id, stagedMediaIds)
      : new Map<number, { cdnUrl: string }>();
    const row = this.variantRepo.create({
      productId,
      price: dto.price ?? null,
      inStock: dto.inStock ?? null,
      quantity: dto.quantity ?? null,
      sku: dto.sku?.trim() || null,
      status: dto.status ?? ProductStatus.draft,
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
        productId,
        saved.id,
        stagedMediaIds,
        stagedById,
      );
    }
    return this.findOneForOwner(ownerId, productId);
  }

  async updateVariantForOwner(
    ownerId: number,
    productId: number,
    variantId: number,
    dto: UpdateProductVariantDto,
  ): Promise<ProductDetailDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    await this.requireProduct(workspace.id, productId);
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, productId },
    });
    if (!variant) {
      throw new NotFoundException("Variant not found");
    }
    if (dto.customFields !== undefined) {
      const fieldDefs =
        await this.variantCustomFields.listDefinitionsForWorkspace(
          workspace.id,
        );
      const resolved = this.variantCustomFields.resolveVariantStorage(
        fieldDefs,
        { customFields: dto.customFields },
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
      variant.quantity = dto.quantity;
    }
    if (dto.mediaIds?.length) {
      const stagedById = await this.uploadMedia.requireForWorkspace(
        workspace.id,
        dto.mediaIds,
      );
      await this.insertProductMediaFromStaged(
        this.variantRepo.manager,
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
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
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

  async createMediaForOwner(
    ownerId: number,
    productId: number,
    dto: CreateProductMediaDto,
  ): Promise<ProductDetailDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
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
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
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
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    await this.requireProduct(workspace.id, productId);
    const media = await this.mediaRepo.findOne({
      where: { id: mediaId, productId },
    });
    if (!media) {
      throw new NotFoundException("Media not found");
    }
    await this.mediaRepo.remove(media);
  }

  async createSourceReferenceForOwner(
    ownerId: number,
    productId: number,
    dto: CreateProductSourceReferenceDto,
  ): Promise<ProductDetailDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const integration =
      await this.workspaceContext.requireInstagramIntegrationForOwner(ownerId);
    await this.requireProduct(workspace.id, productId);
    const row = this.sourceRefRepo.create({
      companyId: integration.id,
      productId,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId.trim(),
      permalink: dto.permalink?.trim() || null,
      caption: dto.caption?.trim() || null,
      createdByUserId: ownerId,
    });
    await this.sourceRefRepo.save(row);
    return this.findOneForOwner(ownerId, productId);
  }

  async removeSourceReferenceForOwner(
    ownerId: number,
    productId: number,
    referenceId: number,
  ): Promise<void> {
    const integration =
      await this.workspaceContext.requireInstagramIntegrationForOwner(ownerId);
    const ref = await this.sourceRefRepo.findOne({
      where: { id: referenceId, productId, companyId: integration.id },
    });
    if (!ref) {
      throw new NotFoundException("Source reference not found");
    }
    await this.sourceRefRepo.remove(ref);
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
      product.quantity = dto.quantity;
    }
    if (dto.mediaIds?.length) {
      const stagedById = await this.uploadMedia.requireForWorkspace(
        workspaceId,
        dto.mediaIds,
      );
      const manager = em ?? this.productRepo.manager;
      await this.insertProductMediaFromStaged(
        manager,
        product.id,
        null,
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
    workspaceId: number,
    product: Product,
    ownerId: number,
    variantInputs: UpdateProductVariantSyncDto[],
  ): Promise<void> {
    const productType = product.productType;
    if (productType === ProductType.variants && variantInputs.length === 0) {
      throw new BadRequestException(
        "At least one variant is required when product_type is variants",
      );
    }
    if (productType === ProductType.single && variantInputs.length > 1) {
      throw new BadRequestException(
        "product_type single allows at most one variant",
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

    const fieldDefs = await this.variantCustomFields.listDefinitionsForWorkspace(
      workspaceId,
    );
    const stagedMediaIds = this.collectStagedMediaIdsFromVariantSync(
      variantInputs,
    );
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
          product.id,
          variant,
          spec,
          fieldDefs,
          ownerId,
          stagedById,
        );
      } else {
        const resolved = this.variantCustomFields.resolveVariantStorage(
          fieldDefs,
          { customFields: spec.customFields },
        );
        const variant = await em.save(
          em.create(ProductVariant, {
            productId: product.id,
            price: spec.price ?? null,
            inStock: spec.inStock ?? null,
            quantity: spec.quantity ?? null,
            sku: spec.sku?.trim() || null,
            status: spec.status ?? ProductStatus.draft,
            createdByUserId: ownerId,
            updatedByUserId: null,
          }),
        );
        await this.variantCustomFields.upsertValuesForVariant(
          em,
          variant.id,
          resolved,
        );
        if (spec.mediaIds?.length) {
          await this.insertProductMediaFromStaged(
            em,
            product.id,
            variant.id,
            spec.mediaIds,
            stagedById,
          );
        }
      }
    }
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
    productId: number,
    variant: ProductVariant,
    spec: UpdateProductVariantSyncDto,
    fieldDefs: WorkspaceVariantCustomField[],
    ownerId: number,
    stagedById: Map<number, { cdnUrl: string }>,
  ): Promise<void> {
    if (spec.customFields !== undefined) {
      const resolved = this.variantCustomFields.resolveVariantStorage(
        fieldDefs,
        { customFields: spec.customFields },
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
      variant.quantity = spec.quantity;
    }
    if (spec.sku !== undefined) {
      variant.sku = spec.sku?.trim() || null;
    }
    if (spec.status !== undefined) {
      variant.status = spec.status;
    }
    variant.updatedByUserId = ownerId;
    await em.save(variant);

    if (spec.mediaIds?.length) {
      await this.insertProductMediaFromStaged(
        em,
        productId,
        variant.id,
        spec.mediaIds,
        stagedById,
      );
    }
  }

  private async findVariantIdsReferencedByOrders(
    productId: number,
    em?: EntityManager,
  ): Promise<Set<number>> {
    const repo = em
      ? em.getRepository(OrderItem)
      : this.orderItemRepo;
    const rows = await repo.find({
      where: { productId },
      select: ["variantId"],
    });
    return new Set(rows.map((r) => r.variantId));
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

    return {
      id: v.id,
      productId: p.id,
      customFields: serializeVariantCustomFields(v, fieldDefs),
      sku: v.sku,
      unitPrice,
      imageUrl,
      inStock: v.inStock ?? p.inStock,
      quantity: v.quantity ?? p.quantity,
      status: v.status,
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

    if (query.status !== undefined) {
      qb.andWhere("p.status = :status", { status: query.status });
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
  ): ProductListItemBaseDto {
    return {
      id: p.id,
      name: p.name,
      productType: p.productType,
      status: p.status,
      price: p.price,
      currency: p.currency,
      inStock: p.inStock,
      quantity: p.quantity,
      mainImageUrl: this.resolveMainImageUrl(p, mainImageByProductId),
      categoryId: p.categoryId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
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

  private buildVariantDtos(
    p: Product,
    fieldDefs: WorkspaceVariantCustomField[],
  ): ProductVariantDto[] {
    const variants = [...(p.variants ?? [])].sort((a, b) => a.id - b.id);
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
      const vMedia = (mediaByVariant.get(v.id) ?? []).sort(mediaSort);
      const variantImage = pickMainMediaUrl(vMedia);
      return {
        id: v.id,
        customFields: serializeVariantCustomFields(v, fieldDefs),
        price: v.price,
        inStock: v.inStock,
        quantity: v.quantity,
        imageUrl: variantImage,
        sku: v.sku,
        status: v.status,
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
  ): ProductVariantListItemDto {
    const p = v.product;
    if (p == null) {
      throw new Error("ProductVariant row missing product (invariant)");
    }
    const media = [...(v.media ?? [])].sort(mediaSort);
    const variantImage = pickMainMediaUrl(media);
    return {
      id: v.id,
      customFields: serializeVariantCustomFields(v, fieldDefs),
      price: v.price,
      inStock: v.inStock,
      quantity: v.quantity,
      imageUrl: variantImage,
      sku: v.sku,
      status: v.status,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      media: media.map((m) => this.toMediaDto(m)),
      categoryId: p.categoryId,
      name: p.name,
      product_parent: this.toProductParentSummary(p, mainImageByProductId),
    };
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
  ): ProductDetailDto {
    const allMedia = [...(p.media ?? [])];
    const productLevelMedia = allMedia
      .filter((m) => m.variantId == null)
      .sort(mediaSort);
    const refs = [...(p.sourceReferences ?? [])].sort((a, b) => a.id - b.id);
    const categoryNode = p.category;
    const categorySummary: ProductCategorySummaryDto | null = categoryNode
      ? {
          id: categoryNode.id,
          name: categoryNode.name,
          parentId: categoryNode.parentId,
        }
      : null;

    return {
      ...this.toListItem(p, undefined),
      description: p.description,
      sourceType: p.sourceType,
      createdByUserId: p.createdByUserId,
      updatedByUserId: p.updatedByUserId,
      category: categorySummary,
      variants: this.buildVariantDtos(p, fieldDefs),
      media: productLevelMedia.map((m) => this.toMediaDto(m)),
      sourceReferences: refs.map((r) => ({
        id: r.id,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        permalink: r.permalink,
        caption: r.caption,
        createdAt: r.createdAt,
      })),
    };
  }
}
