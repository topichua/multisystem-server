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
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { CreateProductDto } from "./dto/create-product.dto";
import { CreateProductMediaDto } from "./dto/create-product-media.dto";
import { CreateProductSourceReferenceDto } from "./dto/create-product-source-reference.dto";
import { CreateProductVariantDto } from "./dto/create-product-variant.dto";
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
} from "./products.service";
import type { ProductMedia } from "../database/entities";

@ApiTags("products")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("products")
export class ProductsController {
  constructor(
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

  @Get(":id/media/effective")
  async getEffectiveMedia(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Query("variantId") variantIdRaw?: string,
  ): Promise<ProductMedia[]> {
    const ownerId = this.requireNumericOwnerId(req);
    const company = await this.products.getIntegrationForOwner(ownerId);
    const variantId = this.parseOptionalVariantId(variantIdRaw);
    return this.productMedia.getEffectiveMedia(company.id, id, variantId);
  }

  @Get(":id/media")
  async getProductMedia(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<ProductMedia[]> {
    const ownerId = this.requireNumericOwnerId(req);
    const company = await this.products.getIntegrationForOwner(ownerId);
    return this.productMedia.getProductMedia(company.id, id);
  }

  @Put(":id/media")
  async replaceProductMedia(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: ReplaceProductMediaRequestDto,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const company = await this.products.getIntegrationForOwner(ownerId);
    await this.productMedia.replaceMedia(company.id, ownerId, id, dto.items);
    return this.products.findOneForOwner(ownerId, id);
  }

  @Get(":id/variants/:variantId/media")
  async getVariantMedia(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Param("variantId", ParseIntPipe) variantId: number,
  ): Promise<ProductMedia[]> {
    const ownerId = this.requireNumericOwnerId(req);
    const company = await this.products.getIntegrationForOwner(ownerId);
    return this.productMedia.getVariantMedia(company.id, id, variantId);
  }

  @Put(":id/variants/:variantId/media")
  async replaceVariantMedia(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Param("variantId", ParseIntPipe) variantId: number,
    @Body() dto: ReplaceProductMediaRequestDto,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const company = await this.products.getIntegrationForOwner(ownerId);
    await this.productMedia.replaceVariantMedia(
      company.id,
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
  async create(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateProductDto,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.products.createForOwner(ownerId, dto);
  }

  @Patch(":id")
  async update(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.products.updateForOwner(ownerId, id, dto);
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
  async addVariant(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: CreateProductVariantDto,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.products.createVariantForOwner(ownerId, id, dto);
  }

  @Patch(":id/variants/:variantId")
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
  async addMedia(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: CreateProductMediaDto,
  ): Promise<ProductDetailDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.products.createMediaForOwner(ownerId, id, dto);
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
