import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { ClientsService } from "./clients.service";
import { AddClientWishlistRequestDto } from "./dto/add-client-wishlist-request.dto";
import { ClientWishlistItemResponseDto } from "./dto/client-wishlist-item-response.dto";
import { ClientWishlistProductsResponseDto } from "./dto/client-wishlist-products-response.dto";
import { RemoveClientWishlistRequestDto } from "./dto/remove-client-wishlist-request.dto";

@ApiTags("clients")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("clients/:id/wishlist")
export class ClientWishlistController {
  constructor(private readonly clients: ClientsService) {}

  @Get("products")
  @ApiOperation({
    summary: "List wishlisted products for a client",
    description:
      "Returns products grouped by id (same shape as GET /conversations/:id/suggestions). " +
      "Each variant includes `referenceId` = client_wishlist_items.id.",
  })
  @ApiParam({ name: "id", type: Number, description: "Client primary key" })
  @ApiOkResponse({ type: ClientWishlistProductsResponseDto })
  listWishlistProducts(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
  ): Promise<ClientWishlistProductsResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const clientId = this.parsePositiveInt(id, "id");
    return this.clients.listWishlistProductsForOwner(ownerId, clientId);
  }

  @Post()
  @ApiOperation({ summary: "Add product variant to client wishlist" })
  @ApiParam({ name: "id", type: Number, description: "Client primary key" })
  @ApiBody({ type: AddClientWishlistRequestDto })
  @ApiCreatedResponse({ type: ClientWishlistItemResponseDto })
  addToWishlist(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
    @Body() dto: AddClientWishlistRequestDto,
  ): Promise<ClientWishlistItemResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const clientId = this.parsePositiveInt(id, "id");
    return this.clients.addWishlistItemForOwner(ownerId, clientId, dto);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: "Remove product variant from client wishlist" })
  @ApiParam({ name: "id", type: Number, description: "Client primary key" })
  @ApiBody({ type: RemoveClientWishlistRequestDto })
  @ApiNoContentResponse({
    description: "Removed when present; idempotent when already absent.",
  })
  async removeFromWishlist(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
    @Body() dto: RemoveClientWishlistRequestDto,
  ): Promise<void> {
    const ownerId = this.requireNumericOwnerId(req);
    const clientId = this.parsePositiveInt(id, "id");
    await this.clients.removeWishlistItemForOwner(ownerId, clientId, dto);
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

  private parsePositiveInt(raw: string, field: string): number {
    const t = raw?.trim() ?? "";
    if (!/^\d+$/.test(t)) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    const n = Number(t);
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    return n;
  }
}
