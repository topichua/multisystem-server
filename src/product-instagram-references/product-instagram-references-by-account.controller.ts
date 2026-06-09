import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { ListProductInstagramReferencesByAccountQueryDto } from "./dto/list-product-instagram-references-by-account-query.dto";
import { ProductInstagramReferenceProductIdsResponseDto } from "./dto/product-instagram-reference-product-ids-response.dto";
import { ProductInstagramReferenceListResponseDto } from "./dto/product-instagram-reference-response.dto";
import { ProductInstagramReferencesService } from "./product-instagram-references.service";

@ApiTags("product-instagram-references")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("api/instagram/references")
export class ProductInstagramReferencesByAccountController {
  constructor(
    private readonly references: ProductInstagramReferencesService,
  ) {}

  @Get("product-ids")
  @ApiOperation({
    summary: "List distinct product + variant pairs referenced by a Business account",
    description:
      "Returns unique `{ productId, productVariantId }` pairs from `product_instagram_references` " +
      "for the given Business Account id. Does not load product entities.",
  })
  @ApiOkResponse({ type: ProductInstagramReferenceProductIdsResponseDto })
  async listProductIdsByInstagramAccount(
    @Req() req: { user?: AuthUser },
    @Query() query: ListProductInstagramReferencesByAccountQueryDto,
  ): Promise<ProductInstagramReferenceProductIdsResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const instagramAccountId = this.resolveInstagramAccountId(query);
    return this.references.listProductIdsForInstagramAccount(
      ownerId,
      instagramAccountId,
      query.workspace_id,
    );
  }

  @Get()
  @ApiOperation({
    summary: "List product Instagram references for a Business account",
    description:
      "Returns all `product_instagram_references` rows whose stored Business Account id " +
      "matches the query. Scoped to your workspace; does not require an active integration.",
  })
  @ApiOkResponse({ type: ProductInstagramReferenceListResponseDto })
  async listByInstagramAccount(
    @Req() req: { user?: AuthUser },
    @Query() query: ListProductInstagramReferencesByAccountQueryDto,
  ): Promise<ProductInstagramReferenceListResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.references.listForInstagramAccount(
      ownerId,
      this.resolveInstagramAccountId(query),
      query.workspace_id,
    );
  }

  private resolveInstagramAccountId(
    query: ListProductInstagramReferencesByAccountQueryDto,
  ): string {
    const instagramAccountId =
      query.instagram_account_id?.trim() || query.businessAccountId?.trim();
    if (!instagramAccountId) {
      throw new BadRequestException(
        "instagram_account_id or businessAccountId query parameter is required",
      );
    }
    return instagramAccountId;
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
