import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import type { Request } from "express";
import { CloudflareImagesService } from "./cloudflare-images.service";
import { AddProductGalleryImageFormDto } from "./dto/add-product-gallery-image-form.dto";
import { CreateProductDto } from "./dto/create-product.dto";
import { CreateProductVariantDto } from "./dto/create-product-variant.dto";
import { CatalogVariantListResponseDto } from "./dto/catalog-variant-list-response.dto";
import { ListCatalogVariantsQueryDto } from "./dto/list-catalog-variants-query.dto";
import { ListProductsQueryDto } from "./dto/list-products-query.dto";
import { ProductListResponseDto as ProductListResponseSwaggerDto } from "./dto/product-list-response.dto";
import { ReplaceProductMediaRequestDto } from "./dto/replace-product-media.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { UpdateProductMediaDto } from "./dto/update-product-media.dto";
import { UpdateProductVariantDto } from "./dto/update-product-variant.dto";
import { ProductMediaService } from "./product-media.service";
import { UploadMediaResponseDto } from "./dto/upload-media-response.dto";
import { UploadMediaService } from "./upload-media.service";
import {
  ProductsService,
  type ProductDetailDto,
  type ProductListResponseDto,
  type ProductVariantListResponseDto,
} from "./products.service";
import type { ProductMedia } from "../database/entities";
import { ProductMediaType } from "../database/entities/product-media-type.enum";

type UploadedImageFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
};

@ApiTags("products")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("products")
export class ProductsController {
  constructor(
    private readonly cloudflareImages: CloudflareImagesService,
    private readonly products: ProductsService,
    private readonly productMedia: ProductMediaService,
    private readonly uploadMedia: UploadMediaService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List products",
    description:
      "Paginated products for the authenticated owner's workspace. Each item includes nested `variants` " +
      "(custom fields, price/stock, and variant media). Supports filters: status, categoryIds, keyword, price range, sort.",
  })
  @ApiOkResponse({ type: ProductListResponseSwaggerDto })
  async list(
    @Req() req: { user?: AuthUser },
    @Query() query: ListProductsQueryDto,
  ): Promise<ProductListResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.products.listForOwner(ownerId, query);
  }

  @Get("catalog-variants")
  @ApiOperation({
    summary: "Search catalog variants (flat list with product info)",
    description:
      "Paginated flat list of variants with embedded `product` fields — for order line pickers and catalog search. " +
      "Search via `q` or `keyword` (product name, SKU, custom field values). Defaults to `active` products only.",
  })
  @ApiOkResponse({ type: CatalogVariantListResponseDto })
  async listCatalogVariants(
    @Req() req: { user?: AuthUser },
    @Query() query: ListCatalogVariantsQueryDto,
  ): Promise<CatalogVariantListResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.products.listCatalogVariantsForOwner(ownerId, query);
  }

  @Get("variants")
  @ApiOperation({
    summary: "List product variants (full rows)",
    description:
      "Paginated variants with `product_parent`, filters, and variant `media`. For a lighter picker, use `GET /products/catalog-variants`.",
  })
  async listVariants(
    @Req() req: { user?: AuthUser },
    @Query() query: ListProductsQueryDto,
  ): Promise<ProductVariantListResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.products.listVariantsForOwner(ownerId, query);
  }

  @Post("upload-media")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Upload image before product exists",
    description:
      "Uploads to Cloudflare CDN and stores a row in `upload_media`. " +
      "Reference returned `id` in POST /products via mediaIds (product or variant). " +
      "Call `DELETE /products/upload-media/:id` if the user removes the image before save.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: { image: { type: "string", format: "binary" } },
      required: ["image"],
    },
  })
  @ApiOkResponse({ type: UploadMediaResponseDto })
  async uploadStagingMedia(
    @Req() req: { user?: AuthUser },
    @UploadedFile() image?: UploadedImageFile,
  ): Promise<UploadMediaResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    if (!image) {
      throw new BadRequestException("Multipart field `image` is required.");
    }
    const workspaceId = await this.products.getWorkspaceIdForOwner(ownerId);
    return this.uploadMedia.uploadForWorkspace(workspaceId, ownerId, image);
  }

  @Delete("upload-media/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Remove staged upload before product is saved",
    description:
      "Only allowed while no product_media row references this upload_media id (409 if already attached to a product).",
  })
  async deleteStagingMedia(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<void> {
    const ownerId = this.requireNumericOwnerId(req);
    const workspaceId = await this.products.getWorkspaceIdForOwner(ownerId);
    await this.uploadMedia.deleteForWorkspace(workspaceId, id);
  }

  @Get(":id/media/effective")
  async getEffectiveMedia(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Query("variantId") variantIdRaw?: string,
  ): Promise<ProductMedia[]> {
    const ownerId = this.requireNumericOwnerId(req);
    const workspaceId = await this.products.getWorkspaceIdForOwner(ownerId);
    const variantId = this.parseOptionalVariantId(variantIdRaw);
    return this.productMedia.getEffectiveMedia(workspaceId, id, variantId);
  }

  @Get(":id/media")
  async getProductMedia(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<ProductMedia[]> {
    const ownerId = this.requireNumericOwnerId(req);
    const workspaceId = await this.products.getWorkspaceIdForOwner(ownerId);
    return this.productMedia.getProductMedia(workspaceId, id);
  }

  @Put(":id/media")
  async replaceProductMedia(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ReplaceProductMediaRequestDto,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const workspaceId = await this.products.getWorkspaceIdForOwner(ownerId);
    await this.productMedia.replaceMedia(
      workspaceId,
      ownerId,
      id,
      dto.items,
    );
    return this.products.findOneForOwner(ownerId, id);
  }

  @Get(":id/variants/:variantId/media")
  async getVariantMedia(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Param("variantId", ParseIntPipe) variantId: number,
  ): Promise<ProductMedia[]> {
    const ownerId = this.requireNumericOwnerId(req);
    const workspaceId = await this.products.getWorkspaceIdForOwner(ownerId);
    return this.productMedia.getVariantMedia(workspaceId, id, variantId);
  }

  @Put(":id/variants/:variantId/media")
  async replaceVariantMedia(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Param("variantId", ParseIntPipe) variantId: number,
    @Body() dto: ReplaceProductMediaRequestDto,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const workspaceId = await this.products.getWorkspaceIdForOwner(ownerId);
    await this.productMedia.replaceVariantMedia(
      workspaceId,
      ownerId,
      id,
      variantId,
      dto.items,
    );
    return this.products.findOneForOwner(ownerId, id);
  }

  @Get(":id")
  async getById(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.products.findOneForOwner(ownerId, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create product (single or variants)",
    description:
      "JSON body. Upload images first via POST /products/upload-media, then pass mediaIds on the product " +
      "and/or on each variant in `variants`. Optional shipping fields: weightGrams, lengthCm, widthCm, heightCm. " +
      "Returns 201 with an empty body; use GET /products/:id to load the created product.",
  })
  @ApiBody({ type: CreateProductDto })
  @ApiCreatedResponse({ description: "Product created (empty body)." })
  async create(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateProductDto,
  ): Promise<void> {
    const ownerId = this.requireNumericOwnerId(req);
    await this.products.createForOwner(ownerId, dto);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Update product (partial)",
    description:
      "Partial JSON update. Does not sync variants — use PUT /products/:id for variant set changes.",
  })
  @ApiBody({ type: UpdateProductDto })
  async update(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.products.updateForOwner(ownerId, id, dto);
  }

  @Put(":id")
  @ApiOperation({
    summary: "Replace product",
    description:
      "Updates product fields and, when `variants` is provided, syncs the full variant list. " +
      "Shipping fields weightGrams, lengthCm, widthCm, heightCm are saved on the product row. " +
      "Each variant's `mediaIds` is the full gallery (unlisted staged ids are removed; omit for no images). " +
      "Variants omitted from `variants` are hard-deleted, or archived when referenced by order line items.",
  })
  @ApiBody({ type: UpdateProductDto })
  async replace(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.products.replaceForOwner(ownerId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete product",
    description:
      "Hard-deletes the product when no variants are referenced by order items. " +
      "When any variant appears on an order, order-linked variants and the product are archived; other variants are hard-deleted.",
  })
  async remove(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<void> {
    const ownerId = this.requireNumericOwnerId(req);
    await this.products.removeForOwner(ownerId, id);
  }

  @Post(":id/variants")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Add variant to product",
    description:
      "JSON body. Use mediaIds from POST /products/upload-media for variant images.",
  })
  @ApiBody({ type: CreateProductVariantDto })
  async addVariant(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: CreateProductVariantDto,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.products.createVariantForOwner(ownerId, id, dto);
  }

  @Patch(":id/variants/:variantId")
  @ApiOperation({
    summary: "Update variant",
    description:
      "JSON body. `mediaIds` replaces the variant gallery (staged upload ids not in the list are removed).",
  })
  @ApiBody({ type: UpdateProductVariantDto })
  async updateVariant(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Param("variantId", ParseIntPipe) variantId: number,
    @Body() dto: UpdateProductVariantDto,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.products.updateVariantForOwner(ownerId, id, variantId, dto);
  }

  @Delete(":id/variants/:variantId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete variant",
    description:
      "Hard-deletes the variant unless it is referenced by order line items, in which case it is archived.",
  })
  async removeVariant(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Param("variantId", ParseIntPipe) variantId: number,
  ): Promise<void> {
    const ownerId = this.requireNumericOwnerId(req);
    await this.products.removeVariantForOwner(ownerId, id, variantId);
  }

  @Post(":id/media")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Add product gallery image",
    description:
      "Content-Type must be `multipart/form-data`. Send the file in part `image` (required). Optional part `sortOrder` (integer). Do not send JSON `url` / `type` / `sourceUrl` — the server uploads to Cloudflare and stores the CDN URL in `product_media.url`.",
  })
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    description:
      "Multipart body: binary part `image` plus optional text part `sortOrder`.",
    required: true,
    // OpenAPI 3 multipart; @nestjs/swagger's ApiBody typings omit `content`.
    ...({
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            required: ["image"],
            properties: {
              image: {
                type: "string",
                format: "binary",
                description: "Image file (JPEG, PNG, WebP, …)",
              },
              sortOrder: {
                type: "integer",
                minimum: 0,
                description:
                  "Optional gallery order; omit to append after existing items.",
              },
            },
          },
        },
      },
    } as Record<string, unknown>),
  })
  async addMedia(
    @Req() req: Request & { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() body: AddProductGalleryImageFormDto,
    @UploadedFile() image?: UploadedImageFile,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const headers = req.headers as Record<
      string,
      string | string[] | undefined
    >;
    const rawCt = headers["content-type"];
    let ctLower = "";
    if (typeof rawCt === "string") {
      ctLower = rawCt.toLowerCase();
    } else if (Array.isArray(rawCt)) {
      for (const part of rawCt) {
        if (typeof part === "string" && part.length > 0) {
          ctLower = part.toLowerCase();
          break;
        }
      }
    }
    if (ctLower.length > 0 && !ctLower.includes("multipart/form-data")) {
      throw new BadRequestException(
        'Expected Content-Type: multipart/form-data with a file part named "image". JSON bodies (url, type, sourceUrl) are not accepted on this route.',
      );
    }
    if (!image) {
      throw new BadRequestException("Multipart field `image` is required.");
    }
    const workspaceId = await this.products.getWorkspaceIdForOwner(ownerId);
    const url = (await this.cloudflareImages.uploadImage(image)).cdnUrl;
    await this.productMedia.addMedia(workspaceId, ownerId, {
      productId: id,
      url,
      type: ProductMediaType.image,
      sourceUrl: null,
      sortOrder: body.sortOrder,
    });
    return this.products.findOneForOwner(ownerId, id);
  }

  @Patch(":id/media/:mediaId")
  async updateMedia(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Param("mediaId", ParseIntPipe) mediaId: number,
    @Body() dto: UpdateProductMediaDto,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.products.updateMediaForOwner(ownerId, id, mediaId, dto);
  }

  @Delete(":id/media/:mediaId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMedia(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Param("mediaId", ParseIntPipe) mediaId: number,
  ): Promise<void> {
    const ownerId = this.requireNumericOwnerId(req);
    await this.products.removeMediaForOwner(ownerId, id, mediaId);
  }

  private requireNumericOwnerId(req: { user?: AuthUser }): number {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return ownerId;
  }

  private parseOptionalVariantId(raw?: string): number | undefined {
    if (raw === undefined || raw === "") {
      return undefined;
    }
    const n = Number.parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 1) {
      throw new BadRequestException(
        "variantId must be a positive integer when provided",
      );
    }
    return n;
  }
}
