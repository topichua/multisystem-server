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
import { CreateProductSourceReferenceDto } from "./dto/create-product-source-reference.dto";
import { CreateProductVariantDto } from "./dto/create-product-variant.dto";
import { CatalogVariantListResponseDto } from "./dto/catalog-variant-list-response.dto";
import { ListCatalogVariantsQueryDto } from "./dto/list-catalog-variants-query.dto";
import { ListProductsQueryDto } from "./dto/list-products-query.dto";
import { ReplaceProductMediaRequestDto } from "./dto/replace-product-media.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { UpdateProductMediaDto } from "./dto/update-product-media.dto";
import { UpdateProductVariantDto } from "./dto/update-product-variant.dto";
import { ProductMediaService } from "./product-media.service";
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
  ) {}

  @Get()
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
      "Search via `q` or `keyword` (product name, SKU, color, size). Defaults to `active` products only.",
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
  @UseInterceptors(
    FileInterceptor("mainImage", {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        product_type: {
          type: "string",
          enum: ["single", "variants"],
          default: "single",
        },
        status: { type: "string" },
        sourceType: { type: "string" },
        sourceId: { type: "string" },
        referenceGroupId: { type: "string" },
        price: { type: "number" },
        currency: { type: "string" },
        inStock: { type: "boolean" },
        quantity: { type: "number" },
        mainImageUrl: { type: "string" },
        categoryId: { type: "number" },
        mainImage: { type: "string", format: "binary" },
      },
      required: ["name"],
    },
  })
  async create(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateProductDto,
    @UploadedFile() mainImage?: UploadedImageFile,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const uploadedMainImageUrl = mainImage
      ? await this.cloudflareImages.uploadImage(mainImage)
      : undefined;
    const payload: CreateProductDto = {
      ...dto,
      ...(uploadedMainImageUrl ? { mainImageUrl: uploadedMainImageUrl } : {}),
    };
    return this.products.createForOwner(ownerId, payload);
  }

  @Patch(":id")
  @UseInterceptors(
    FileInterceptor("mainImage", {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string", nullable: true },
        status: { type: "string" },
        sourceType: { type: "string", nullable: true },
        sourceId: { type: "string", nullable: true },
        referenceGroupId: { type: "string", nullable: true },
        price: { type: "number", nullable: true },
        currency: { type: "string" },
        inStock: { type: "boolean", nullable: true },
        quantity: { type: "number", nullable: true },
        mainImageUrl: { type: "string", nullable: true },
        categoryId: { type: "number", nullable: true },
        mainImage: { type: "string", format: "binary" },
      },
    },
  })
  async update(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @UploadedFile() mainImage?: UploadedImageFile,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const uploadedMainImageUrl = mainImage
      ? await this.cloudflareImages.uploadImage(mainImage)
      : undefined;
    const payload: UpdateProductDto = {
      ...dto,
      ...(uploadedMainImageUrl ? { mainImageUrl: uploadedMainImageUrl } : {}),
    };
    return this.products.updateForOwner(ownerId, id, payload);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<void> {
    const ownerId = this.requireNumericOwnerId(req);
    await this.products.removeForOwner(ownerId, id);
  }

  @Post(":id/variants")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        color: { type: "string" },
        size: { type: "string" },
        price: { type: "number" },
        inStock: { type: "boolean" },
        quantity: { type: "number" },
        imageUrl: { type: "string" },
        sku: { type: "string" },
        status: { type: "string", enum: ["draft", "active", "archived"] },
        image: { type: "string", format: "binary" },
      },
    },
  })
  async addVariant(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: CreateProductVariantDto,
    @UploadedFile() image?: UploadedImageFile,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const uploadedImageUrl = image
      ? await this.cloudflareImages.uploadImage(image)
      : undefined;
    const payload: CreateProductVariantDto = {
      ...dto,
      ...(uploadedImageUrl ? { imageUrl: uploadedImageUrl } : {}),
    };
    return this.products.createVariantForOwner(ownerId, id, payload);
  }

  @Patch(":id/variants/:variantId")
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        color: { type: "string", nullable: true },
        size: { type: "string", nullable: true },
        price: { type: "number", nullable: true },
        inStock: { type: "boolean", nullable: true },
        quantity: { type: "number", nullable: true },
        imageUrl: { type: "string", nullable: true },
        sku: { type: "string", nullable: true },
        status: { type: "string", enum: ["draft", "active", "archived"] },
        image: { type: "string", format: "binary" },
      },
    },
  })
  async updateVariant(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Param("variantId", ParseIntPipe) variantId: number,
    @Body() dto: UpdateProductVariantDto,
    @UploadedFile() image?: UploadedImageFile,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const uploadedImageUrl = image
      ? await this.cloudflareImages.uploadImage(image)
      : undefined;
    const payload: UpdateProductVariantDto = {
      ...dto,
      ...(uploadedImageUrl ? { imageUrl: uploadedImageUrl } : {}),
    };
    return this.products.updateVariantForOwner(ownerId, id, variantId, payload);
  }

  @Delete(":id/variants/:variantId")
  @HttpCode(HttpStatus.NO_CONTENT)
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
    const url = await this.cloudflareImages.uploadImage(image);
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

  @Post(":id/source-references")
  @HttpCode(HttpStatus.CREATED)
  async addSourceReference(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: CreateProductSourceReferenceDto,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.products.createSourceReferenceForOwner(ownerId, id, dto);
  }

  @Delete(":id/source-references/:referenceId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeSourceReference(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Param("referenceId", ParseIntPipe) referenceId: number,
  ): Promise<void> {
    const ownerId = this.requireNumericOwnerId(req);
    await this.products.removeSourceReferenceForOwner(ownerId, id, referenceId);
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
