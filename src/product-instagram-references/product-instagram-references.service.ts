import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Product,
  ProductInstagramReference,
  ProductVariant,
} from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type { CreateProductInstagramReferenceDto } from "./dto/create-product-instagram-reference.dto";
import type { InstagramPostProductVariantsResponseDto } from "../instagram/dto/instagram-post-product-variants-response.dto";
import { ProductsService } from "../products/products.service";
import type { ProductInstagramReferenceProductIdsResponseDto } from "./dto/product-instagram-reference-product-ids-response.dto";
import type {
  ProductInstagramReferenceDto,
  ProductInstagramReferenceListResponseDto,
} from "./dto/product-instagram-reference-response.dto";

@Injectable()
export class ProductInstagramReferencesService {
  constructor(
    @InjectRepository(ProductInstagramReference)
    private readonly referenceRepo: Repository<ProductInstagramReference>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly products: ProductsService,
  ) {}

  async listProductIdsForInstagramAccount(
    ownerId: number,
    instagramAccountId: string,
    workspaceIdParam?: number,
  ): Promise<ProductInstagramReferenceProductIdsResponseDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
      undefined,
      workspaceIdParam,
    );
    const accountId = instagramAccountId.trim();
    const rows = await this.referenceRepo
      .createQueryBuilder("r")
      .select("r.product_id", "productId")
      .addSelect("r.product_variant_id", "productVariantId")
      .addSelect("r.post_id", "postId")
      .where("r.workspace_id = :workspaceId", { workspaceId: workspace.id })
      .andWhere("r.instagram_account_id = :accountId", { accountId })
      .orderBy("r.post_id", "ASC")
      .addOrderBy("r.product_id", "ASC")
      .addOrderBy("r.product_variant_id", "ASC", "NULLS FIRST")
      .getRawMany<{
        productId: string | number;
        productVariantId: string | number | null;
        postId: string;
      }>();

    return {
      businessAccountId: accountId,
      pairs: rows.map((row) => ({
        productId: Number(row.productId),
        productVariantId:
          row.productVariantId == null ? null : Number(row.productVariantId),
        postId: row.postId,
      })),
    };
  }

  async listProductsForPost(
    ownerId: number,
    postId: string,
    integrationId: number,
  ): Promise<InstagramPostProductVariantsResponseDto> {
    const { postId: trimmedPostId, businessAccountId, references } =
      await this.resolveReferencesForPost(ownerId, postId, integrationId);
    const items = await this.products.listListItemsForInstagramReferences(
      ownerId,
      references,
    );
    return {
      postId: trimmedPostId,
      businessAccountId,
      items,
    };
  }

  async removeReferenceForPost(
    ownerId: number,
    postId: string,
    referenceId: number,
    integrationId: number,
  ): Promise<void> {
    const { postId: trimmedPostId, businessAccountId } =
      await this.resolvePostScope(ownerId, postId, integrationId);
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const ref = await this.referenceRepo.findOne({
      where: {
        id: referenceId,
        workspaceId: workspace.id,
        postId: trimmedPostId,
        instagramAccountId: businessAccountId,
      },
    });
    if (!ref) {
      throw new NotFoundException("Instagram reference not found for this post");
    }
    await this.referenceRepo.remove(ref);
  }

  private async resolvePostScope(
    ownerId: number,
    postId: string,
    integrationId: number,
  ): Promise<{ postId: string; businessAccountId: string; workspaceId: number }> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    const integration =
      await this.workspaceContext.requireInstagramIntegrationByIdForOwner(
        ownerId,
        integrationId,
      );
    const businessAccountId = integration.instagramAccountId?.trim();
    if (!businessAccountId) {
      throw new NotFoundException(
        "Instagram integration has no connected Business account id",
      );
    }
    return {
      postId: postId.trim(),
      businessAccountId,
      workspaceId: workspace.id,
    };
  }

  private async resolveReferencesForPost(
    ownerId: number,
    postId: string,
    integrationId: number,
  ): Promise<{
    postId: string;
    businessAccountId: string;
    references: Array<{
      referenceId: number;
      productId: number;
      productVariantId: number | null;
    }>;
  }> {
    const { postId: trimmedPostId, businessAccountId, workspaceId } =
      await this.resolvePostScope(ownerId, postId, integrationId);
    const rows = await this.referenceRepo.find({
      where: {
        workspaceId,
        instagramAccountId: businessAccountId,
        postId: trimmedPostId,
      },
      order: { id: "ASC" },
    });

    return {
      postId: trimmedPostId,
      businessAccountId,
      references: rows.map((row) => ({
        referenceId: row.id,
        productId: row.productId,
        productVariantId: row.productVariantId,
      })),
    };
  }

  async listForInstagramAccount(
    ownerId: number,
    instagramAccountId: string,
    workspaceIdParam?: number,
  ): Promise<ProductInstagramReferenceListResponseDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
      undefined,
      workspaceIdParam,
    );
    const rows = await this.referenceRepo.find({
      where: {
        workspaceId: workspace.id,
        instagramAccountId: instagramAccountId.trim(),
      },
      order: { id: "ASC" },
    });
    return { data: rows.map((row) => this.toDto(row)) };
  }

  async listForProduct(
    ownerId: number,
    productId: number,
  ): Promise<ProductInstagramReferenceListResponseDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    await this.requireProduct(workspace.id, productId);
    const rows = await this.referenceRepo.find({
      where: { workspaceId: workspace.id, productId },
      order: { id: "ASC" },
    });
    return { data: rows.map((row) => this.toDto(row)) };
  }

  async createForProduct(
    ownerId: number,
    productId: number,
    dto: CreateProductInstagramReferenceDto,
  ): Promise<ProductInstagramReferenceDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    await this.requireProduct(workspace.id, productId);
    const businessAccountId = dto.businessAccountId.trim();
    const productVariantId = await this.resolveVariantId(
      productId,
      dto.productVariantId,
    );
    const row = this.referenceRepo.create({
      workspaceId: workspace.id,
      instagramAccountId: businessAccountId,
      productId,
      productVariantId,
      postId: dto.postId.trim(),
      permalink: dto.permalink?.trim() || null,
      createdById: ownerId,
    });
    const saved = await this.referenceRepo.save(row);
    return this.toDto(saved);
  }

  async removeForProduct(
    ownerId: number,
    productId: number,
    referenceId: number,
  ): Promise<void> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
    await this.requireProduct(workspace.id, productId);
    const ref = await this.referenceRepo.findOne({
      where: {
        id: referenceId,
        productId,
        workspaceId: workspace.id,
      },
    });
    if (!ref) {
      throw new NotFoundException("Instagram reference not found");
    }
    await this.referenceRepo.remove(ref);
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

  private async resolveVariantId(
    productId: number,
    productVariantId?: number,
  ): Promise<number | null> {
    if (productVariantId == null) {
      return null;
    }
    const variant = await this.variantRepo.findOne({
      where: { id: productVariantId, productId },
    });
    if (!variant) {
      throw new NotFoundException(
        "Product variant not found on this product",
      );
    }
    return variant.id;
  }

  private toDto(row: ProductInstagramReference): ProductInstagramReferenceDto {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      businessAccountId: row.instagramAccountId,
      productId: row.productId,
      productVariantId: row.productVariantId,
      permalink: row.permalink,
      postId: row.postId,
      createdById: row.createdById,
      createdAt: row.createdAt,
    };
  }
}
