import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { Product, ProductMedia, ProductVariant } from "../database/entities";
import { ProductMediaType } from "../database/entities/product-media-type.enum";
import { resolveEffectiveMediaOrder } from "./product-media.effective";

export type AddProductMediaPayload = {
  productId: number;
  variantId?: number;
  url: string;
  type: ProductMediaType;
  sortOrder?: number;
  sourceUrl?: string | null;
};

export type ReplaceProductMediaItem = {
  url: string;
  type: ProductMediaType;
  sourceUrl?: string | null;
  sortOrder?: number;
};

@Injectable()
export class ProductMediaService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(ProductMedia)
    private readonly mediaRepo: Repository<ProductMedia>,
  ) {}

  async addMedia(
    companyId: number,
    userId: number,
    payload: AddProductMediaPayload,
  ): Promise<ProductMedia> {
    await this.requireProduct(companyId, payload.productId);
    let variantId: number | null = null;
    if (payload.variantId != null) {
      const variant = await this.variantRepo.findOne({
        where: {
          id: payload.variantId,
          productId: payload.productId,
          companyId,
        },
      });
      if (!variant) {
        throw new BadRequestException(
          "Variant not found or does not belong to this product and company",
        );
      }
      variantId = variant.id;
    }

    const row = this.mediaRepo.create({
      companyId,
      productId: payload.productId,
      variantId,
      url: payload.url.trim(),
      type: payload.type,
      sourceUrl: payload.sourceUrl?.trim() || null,
      sortOrder: payload.sortOrder ?? 0,
      createdByUserId: userId,
      updatedByUserId: null,
    });
    return this.mediaRepo.save(row);
  }

  async getProductMedia(
    companyId: number,
    productId: number,
  ): Promise<ProductMedia[]> {
    await this.requireProduct(companyId, productId);
    return this.sortedMedia(
      await this.mediaRepo.find({
        where: { companyId, productId, variantId: IsNull() },
      }),
    );
  }

  async getVariantMedia(
    companyId: number,
    productId: number,
    variantId: number,
  ): Promise<ProductMedia[]> {
    await this.requireProduct(companyId, productId);
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, companyId, productId },
    });
    if (!variant) {
      throw new NotFoundException("Variant not found");
    }
    return this.sortedMedia(
      await this.mediaRepo.find({
        where: { companyId, productId, variantId },
      }),
    );
  }

  async getEffectiveMedia(
    companyId: number,
    productId: number,
    variantId?: number,
  ): Promise<ProductMedia[]> {
    await this.requireProduct(companyId, productId);
    const productRows = await this.mediaRepo.find({
      where: { companyId, productId, variantId: IsNull() },
    });
    if (variantId == null) {
      return this.sortedMedia(productRows);
    }
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, productId, companyId },
    });
    if (!variant) {
      throw new NotFoundException("Variant not found");
    }
    const variantRows = await this.mediaRepo.find({
      where: { companyId, productId, variantId },
    });
    return resolveEffectiveMediaOrder(variantRows, productRows);
  }

  /**
   * Deletes all product-level media (variant_id IS NULL) and inserts `items` in order.
   */
  async replaceMedia(
    companyId: number,
    userId: number,
    productId: number,
    items: ReplaceProductMediaItem[],
  ): Promise<void> {
    await this.requireProduct(companyId, productId);
    await this.mediaRepo.manager.transaction(async (em) => {
      await em
        .createQueryBuilder()
        .delete()
        .from(ProductMedia)
        .where(
          '"company_id" = :companyId AND "product_id" = :productId AND "variant_id" IS NULL',
          { companyId, productId },
        )
        .execute();
      let order = 0;
      for (const item of items) {
        await em.insert(ProductMedia, {
          companyId,
          productId,
          variantId: null,
          url: item.url.trim(),
          type: item.type,
          sourceUrl: item.sourceUrl?.trim() || null,
          sortOrder: item.sortOrder ?? order,
          createdByUserId: userId,
          updatedByUserId: null,
        });
        order += 1;
      }
    });
  }

  /**
   * Deletes all media for the variant and inserts `items`.
   */
  async replaceVariantMedia(
    companyId: number,
    userId: number,
    productId: number,
    variantId: number,
    items: ReplaceProductMediaItem[],
  ): Promise<void> {
    await this.requireProduct(companyId, productId);
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, companyId, productId },
    });
    if (!variant) {
      throw new NotFoundException("Variant not found");
    }
    await this.mediaRepo.manager.transaction(async (em) => {
      await em
        .createQueryBuilder()
        .delete()
        .from(ProductMedia)
        .where('"company_id" = :companyId AND "variant_id" = :variantId', {
          companyId,
          variantId,
        })
        .execute();
      let order = 0;
      for (const item of items) {
        await em.insert(ProductMedia, {
          companyId,
          productId: variant.productId,
          variantId,
          url: item.url.trim(),
          type: item.type,
          sourceUrl: item.sourceUrl?.trim() || null,
          sortOrder: item.sortOrder ?? order,
          createdByUserId: userId,
          updatedByUserId: null,
        });
        order += 1;
      }
    });
  }

  private sortedMedia(rows: ProductMedia[]): ProductMedia[] {
    return [...rows].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.id - b.id;
    });
  }

  private async requireProduct(
    companyId: number,
    productId: number,
  ): Promise<void> {
    const ok = await this.productRepo.exist({
      where: { id: productId, companyId },
    });
    if (!ok) {
      throw new NotFoundException("Product not found");
    }
  }
}
