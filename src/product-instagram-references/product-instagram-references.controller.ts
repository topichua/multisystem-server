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
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { CreateProductInstagramReferenceDto } from "./dto/create-product-instagram-reference.dto";
import {
  ProductInstagramReferenceDto,
  ProductInstagramReferenceListResponseDto,
} from "./dto/product-instagram-reference-response.dto";
import { ProductInstagramReferencesService } from "./product-instagram-references.service";

@ApiTags("product-instagram-references")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("products/:productId/instagram-references")
export class ProductInstagramReferencesController {
  constructor(
    private readonly references: ProductInstagramReferencesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List Instagram post references for a product",
  })
  @ApiOkResponse({ type: ProductInstagramReferenceListResponseDto })
  async list(
    @Req() req: { user?: AuthUser },
    @Param("productId", ParseIntPipe) productId: number,
  ): Promise<ProductInstagramReferenceListResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.references.listForProduct(ownerId, productId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Link an Instagram post to a product (optionally a variant)",
  })
  @ApiCreatedResponse({ type: ProductInstagramReferenceDto })
  async create(
    @Req() req: { user?: AuthUser },
    @Param("productId", ParseIntPipe) productId: number,
    @Body() dto: CreateProductInstagramReferenceDto,
  ): Promise<ProductInstagramReferenceDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.references.createForProduct(ownerId, productId, dto);
  }

  @Delete(":referenceId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove an Instagram post reference" })
  @ApiNoContentResponse()
  async remove(
    @Req() req: { user?: AuthUser },
    @Param("productId", ParseIntPipe) productId: number,
    @Param("referenceId", ParseIntPipe) referenceId: number,
  ): Promise<void> {
    const ownerId = this.requireNumericOwnerId(req);
    await this.references.removeForProduct(ownerId, productId, referenceId);
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
}
