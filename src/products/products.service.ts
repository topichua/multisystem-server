import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import {
  Company,
  Product,
  ProductCategory,
  ProductMedia,
  ProductSourceReference,
  ProductVariant,
} from "../database/entities";
import { ProductSourceReferenceType } from "../database/entities/product-source-reference-type.enum";
import { ProductSourceType } from "../database/entities/product-source-type.enum";
import { ProductStatus } from "../database/entities/product-status.enum";
import type { CreateProductDto } from "./dto/create-product.dto";
import type { CreateProductMediaDto } from "./dto/create-product-media.dto";
import type { CreateProductSourceReferenceDto } from "./dto/create-product-source-reference.dto";
import type { CreateProductVariantDto } from "./dto/create-product-variant.dto";
import type { ListProductsQueryDto } from "./dto/list-products-query.dto";
import type { UpdateProductDto } from "./dto/update-product.dto";
import type { UpdateProductMediaDto } from "./dto/update-product-media.dto";
import type { UpdateProductVariantDto } from "./dto/update-product-variant.dto";
import { ProductMediaService } from "./product-media.service";

export type ProductVariantDto = {
  id: number;
  color: string | null;
  size: string | null;
  price: number | null;
  inStock: boolean | null;
  quantity: number | null;
  imageUrl: string | null;
  sku: string | null;
  createdAt: Date;
  updatedAt: Date;
  media: ProductMediaDto[];
};

export type ProductMediaDto = {
  id: number;
  productId: number;
  variantId: number | null;
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

export type ProductListItemDto = {
  id: number;
  name: string;
  status: ProductStatus;
  price: number | null;
  currency: string;
  inStock: boolean | null;
  quantity: number | null;
  mainImageUrl: string | null;
  referenceGroupId: string | null;
  categoryId: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductDetailDto = ProductListItemDto & {
  description: string | null;
  sourceType: string | null;
  sourceId: string | null;
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

function expandVariantColorSize(
  colors: string[],
  sizes: string[],
): Array<{ color: string | null; size: string | null }> {
  const colorVals: (string | null)[] = colors.length > 0 ? colors : [null];
  const sizeVals: (string | null)[] = sizes.length > 0 ? sizes : [null];
  const out: Array<{ color: string | null; size: string | null }> = [];
  for (const color of colorVals) {
    for (const size of sizeVals) {
      out.push({ color, size });
    }
  }
  return out;
}

function mergeAnalysisDescription(
  shortDesc: string,
  longDesc: string,
): string | null {
  const s = shortDesc.trim();
  const l = longDesc.trim();
  if (!s && !l) {
    return null;
  }
  if (!s) {
    return l;
  }
  if (!l || s === l) {
    return s;
  }
  return `${s}\n\n${l}`;
}

function tryParsePriceFromOfferText(text: string | null): number | null {
  if (!text?.trim()) {
    return null;
  }
  const normalized = text.replace(/\u00a0/g, " ").trim();
  const m = normalized.match(/(\d+(?:[.,]\d+)?)/);
  if (!m?.[1]) {
    return null;
  }
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return Math.round(n * 100) / 100;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
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
    private readonly productMedia: ProductMediaService,
  ) {}

  /** Used by HTTP layer for media endpoints that need `companyId`. */
  async getIntegrationForOwner(ownerId: number): Promise<Company> {
    return this.requireCompanyForOwner(ownerId);
  }

  async listForOwner(
    ownerId: number,
    query: ListProductsQueryDto,
  ): Promise<ProductListResponseDto> {
    const company = await this.requireCompanyForOwner(ownerId);
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const where: { companyId: number; status?: ProductStatus } = {
      companyId: company.id,
    };
    if (query.status !== undefined) {
      where.status = query.status;
    }
    const [rows, total] = await this.productRepo.findAndCount({
      where,
      order: { updatedAt: "DESC" },
      take: limit,
      skip: offset,
    });
    return {
      items: rows.map((p) => this.toListItem(p)),
      total,
      limit,
      offset,
    };
  }

  async findOneForOwner(
    ownerId: number,
    productId: number,
  ): Promise<ProductDetailDto> {
    const company = await this.requireCompanyForOwner(ownerId);
    const product = await this.productRepo.findOne({
      where: { id: productId, companyId: company.id },
      relations: {
        category: true,
        variants: true,
        media: true,
        sourceReferences: true,
      },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }
    return this.toDetail(product);
  }

  async createForOwner(
    ownerId: number,
    dto: CreateProductDto,
  ): Promise<ProductDetailDto> {
    const company = await this.requireCompanyForOwner(ownerId);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException("name is required");
    }
    await this.assertCategoryBelongsToWorkspaceIfSet(
      company.workspaceId,
      dto.categoryId,
    );

    let productId = 0;
    await this.productRepo.manager.transaction(async (em) => {
      const product = em.create(Product, {
        companyId: company.id,
        categoryId: dto.categoryId ?? null,
        name,
        description: dto.description?.trim() || null,
        status: dto.status ?? ProductStatus.draft,
        sourceType: dto.sourceType ?? null,
        sourceId: dto.sourceId?.trim() || null,
        referenceGroupId: dto.referenceGroupId?.trim() || null,
        price: dto.price ?? null,
        currency: (dto.currency?.trim() || "UAH").slice(0, 8),
        inStock: dto.inStock ?? null,
        quantity: dto.quantity ?? null,
        mainImageUrl: dto.mainImageUrl?.trim() || null,
        createdByUserId: ownerId,
        updatedByUserId: null,
      });
      const saved = await em.save(product);
      productId = saved.id;
    });

    return this.findOneForOwner(ownerId, productId);
  }

  /**
   * Creates a draft catalog product from vision/text analysis: variants = colors × sizes
   * (or a single row when both lists are empty), optional category, and a source reference row.
   */
  async createDraftFromInstagramAnalysis(
    ownerId: number,
    params: CatalogProductFromAnalysisParams,
  ): Promise<ProductDetailDto> {
    const company = await this.requireCompanyForOwner(ownerId);
    const name = params.name.trim().slice(0, 512);
    if (!name) {
      throw new BadRequestException("Product name is required");
    }
    await this.assertCategoryBelongsToWorkspaceIfSet(
      company.workspaceId,
      params.matchedCategoryId,
    );

    const description = mergeAnalysisDescription(
      params.shortDescription,
      params.longDescription,
    );
    const price = tryParsePriceFromOfferText(params.visiblePriceOrOffer);
    const variantSpecs = expandVariantColorSize(params.colors, params.sizes);
    const refType =
      params.sourceType === ProductSourceType.instagram_story
        ? ProductSourceReferenceType.instagram_story
        : ProductSourceReferenceType.instagram_post;

    let productId = 0;
    await this.productRepo.manager.transaction(async (em) => {
      const product = em.create(Product, {
        companyId: company.id,
        categoryId: params.matchedCategoryId ?? null,
        name,
        description,
        status: ProductStatus.draft,
        sourceType: params.sourceType,
        sourceId: params.instagramMediaId,
        referenceGroupId: null,
        price,
        currency: "UAH",
        inStock: null,
        quantity: null,
        mainImageUrl: params.mainImageUrl.trim() || null,
        createdByUserId: ownerId,
        updatedByUserId: null,
      });
      const saved = await em.save(product);
      productId = saved.id;

      for (const spec of variantSpecs) {
        await em.insert(ProductVariant, {
          companyId: company.id,
          productId: saved.id,
          color: spec.color,
          size: spec.size,
          price: null,
          inStock: null,
          quantity: null,
          imageUrl: null,
          sku: null,
          createdByUserId: ownerId,
          updatedByUserId: null,
        });
      }

      await em.insert(ProductSourceReference, {
        companyId: company.id,
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
    const company = await this.requireCompanyForOwner(ownerId);
    const product = await this.productRepo.findOne({
      where: { id: productId, companyId: company.id },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }

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
    if (dto.sourceType !== undefined) {
      product.sourceType = dto.sourceType;
    }
    if (dto.sourceId !== undefined) {
      product.sourceId =
        dto.sourceId === null ? null : dto.sourceId.trim() || null;
    }
    if (dto.referenceGroupId !== undefined) {
      product.referenceGroupId =
        dto.referenceGroupId === null
          ? null
          : dto.referenceGroupId.trim() || null;
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
    if (dto.mainImageUrl !== undefined) {
      product.mainImageUrl =
        dto.mainImageUrl === null ? null : dto.mainImageUrl.trim() || null;
    }
    if (dto.categoryId !== undefined) {
      if (dto.categoryId !== null) {
        await this.assertCategoryBelongsToWorkspaceIfSet(
          company.workspaceId,
          dto.categoryId,
        );
      }
      product.categoryId = dto.categoryId;
    }

    product.updatedByUserId = ownerId;
    await this.productRepo.save(product);
    return this.findOneForOwner(ownerId, productId);
  }

  async removeForOwner(ownerId: number, productId: number): Promise<void> {
    const company = await this.requireCompanyForOwner(ownerId);
    const product = await this.productRepo.findOne({
      where: { id: productId, companyId: company.id },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }
    if (product.status !== ProductStatus.draft) {
      throw new ConflictException(
        "Only products in draft status can be deleted",
      );
    }
    await this.productRepo.remove(product);
  }

  async createVariantForOwner(
    ownerId: number,
    productId: number,
    dto: CreateProductVariantDto,
  ): Promise<ProductDetailDto> {
    const company = await this.requireCompanyForOwner(ownerId);
    await this.requireProduct(company.id, productId);
    const row = this.variantRepo.create({
      companyId: company.id,
      productId,
      color: dto.color?.trim() || null,
      size: dto.size?.trim() || null,
      price: dto.price ?? null,
      inStock: dto.inStock ?? null,
      quantity: dto.quantity ?? null,
      imageUrl: dto.imageUrl?.trim() || null,
      sku: dto.sku?.trim() || null,
      createdByUserId: ownerId,
      updatedByUserId: null,
    });
    await this.variantRepo.save(row);
    return this.findOneForOwner(ownerId, productId);
  }

  async updateVariantForOwner(
    ownerId: number,
    productId: number,
    variantId: number,
    dto: UpdateProductVariantDto,
  ): Promise<ProductDetailDto> {
    const company = await this.requireCompanyForOwner(ownerId);
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, productId, companyId: company.id },
    });
    if (!variant) {
      throw new NotFoundException("Variant not found");
    }
    if (dto.color !== undefined) {
      variant.color = dto.color === null ? null : dto.color.trim() || null;
    }
    if (dto.size !== undefined) {
      variant.size = dto.size === null ? null : dto.size.trim() || null;
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
    if (dto.imageUrl !== undefined) {
      variant.imageUrl =
        dto.imageUrl === null ? null : dto.imageUrl.trim() || null;
    }
    if (dto.sku !== undefined) {
      variant.sku = dto.sku === null ? null : dto.sku.trim() || null;
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
    const company = await this.requireCompanyForOwner(ownerId);
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, productId, companyId: company.id },
    });
    if (!variant) {
      throw new NotFoundException("Variant not found");
    }
    await this.variantRepo.remove(variant);
  }

  async createMediaForOwner(
    ownerId: number,
    productId: number,
    dto: CreateProductMediaDto,
  ): Promise<ProductDetailDto> {
    const company = await this.requireCompanyForOwner(ownerId);
    await this.productMedia.addMedia(company.id, ownerId, {
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
    const company = await this.requireCompanyForOwner(ownerId);
    const media = await this.mediaRepo.findOne({
      where: { id: mediaId, productId, companyId: company.id },
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
    media.updatedByUserId = ownerId;
    await this.mediaRepo.save(media);
    return this.findOneForOwner(ownerId, productId);
  }

  async removeMediaForOwner(
    ownerId: number,
    productId: number,
    mediaId: number,
  ): Promise<void> {
    const company = await this.requireCompanyForOwner(ownerId);
    const media = await this.mediaRepo.findOne({
      where: { id: mediaId, productId, companyId: company.id },
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
    const company = await this.requireCompanyForOwner(ownerId);
    await this.requireProduct(company.id, productId);
    const row = this.sourceRefRepo.create({
      companyId: company.id,
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
    const company = await this.requireCompanyForOwner(ownerId);
    const ref = await this.sourceRefRepo.findOne({
      where: { id: referenceId, productId, companyId: company.id },
    });
    if (!ref) {
      throw new NotFoundException("Source reference not found");
    }
    await this.sourceRefRepo.remove(ref);
  }

  private async requireCompanyForOwner(ownerId: number): Promise<Company> {
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain a numeric owner id",
      );
    }
    const company = await this.companyRepo.findOne({
      where: { ownerId },
      order: { id: "DESC" },
    });
    if (!company) {
      throw new NotFoundException(
        "Integration not found for current user; create a workspace first",
      );
    }
    return company;
  }

  private async requireProduct(
    companyId: number,
    productId: number,
  ): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { id: productId, companyId },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }
    return product;
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

  private toListItem(p: Product): ProductListItemDto {
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      price: p.price,
      currency: p.currency,
      inStock: p.inStock,
      quantity: p.quantity,
      mainImageUrl: p.mainImageUrl,
      referenceGroupId: p.referenceGroupId,
      categoryId: p.categoryId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  private mediaSort(a: ProductMedia, b: ProductMedia): number {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.id - b.id;
  }

  private toMediaDto(m: ProductMedia): ProductMediaDto {
    return {
      id: m.id,
      productId: m.productId,
      variantId: m.variantId,
      url: m.url,
      type: m.type,
      sourceUrl: m.sourceUrl,
      sortOrder: m.sortOrder,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  private toDetail(p: Product): ProductDetailDto {
    const variants = [...(p.variants ?? [])].sort((a, b) => a.id - b.id);
    const allMedia = [...(p.media ?? [])];
    const productLevelMedia = allMedia
      .filter((m) => m.variantId == null)
      .sort((a, b) => this.mediaSort(a, b));
    const mediaByVariant = new Map<number, ProductMedia[]>();
    for (const m of allMedia) {
      if (m.variantId != null) {
        const list = mediaByVariant.get(m.variantId) ?? [];
        list.push(m);
        mediaByVariant.set(m.variantId, list);
      }
    }
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
      ...this.toListItem(p),
      description: p.description,
      sourceType: p.sourceType,
      sourceId: p.sourceId,
      createdByUserId: p.createdByUserId,
      updatedByUserId: p.updatedByUserId,
      category: categorySummary,
      variants: variants.map((v) => {
        const vMedia = (mediaByVariant.get(v.id) ?? []).sort((a, b) =>
          this.mediaSort(a, b),
        );
        return {
          id: v.id,
          color: v.color,
          size: v.size,
          price: v.price,
          inStock: v.inStock,
          quantity: v.quantity,
          imageUrl: v.imageUrl,
          sku: v.sku,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
          media: vMedia.map((m) => this.toMediaDto(m)),
        };
      }),
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
