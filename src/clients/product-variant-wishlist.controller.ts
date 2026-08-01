import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { ClientsService } from "./clients.service";
import { VariantWishlistResponseDto } from "./dto/variant-wishlist-response.dto";

/**
 * Product-scoped wishlist waitlist (clients waiting for a variant).
 * Lives in ClientsModule to avoid ProductsModule ↔ ClientsModule circular import.
 */
@ApiTags("products")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("products")
export class ProductVariantWishlistController {
  constructor(private readonly clients: ClientsService) {}

  @Get(":id/variants/:variantId/wishlist")
  @ApiOperation({
    summary: "List clients waiting for a product variant (wishlist)",
    description:
      "Returns clients who added this variant to their wishlist, with `at` timestamps " +
      "and optional `conversationId` for the «Діалог» action. Ordered newest first. " +
      "Requires wishlist enabled for the workspace.",
  })
  @ApiParam({ name: "id", type: Number, description: "Product id" })
  @ApiParam({ name: "variantId", type: Number, description: "Variant id" })
  @ApiOkResponse({ type: VariantWishlistResponseDto })
  listVariantWishlist(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) productId: number,
    @Param("variantId", ParseIntPipe) variantId: number,
  ): Promise<VariantWishlistResponseDto> {
    return this.clients.listVariantWishlistForOwner(
      this.requireNumericOwnerId(req),
      productId,
      variantId,
    );
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
