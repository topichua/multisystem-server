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
import { AnalyticsQueryDto } from "./dto/analytics-query.dto";
import {
  AnalyticsWishlistPotentialSalesQueryDto,
  AnalyticsWishlistUnmetDemandQueryDto,
} from "./dto/analytics-wishlist-query.dto";
import {
  AnalyticsWishlistPotentialSalesResponseDto,
  AnalyticsWishlistSummaryResponseDto,
  AnalyticsWishlistUnmetDemandResponseDto,
} from "./dto/analytics-wishlist-response.dto";
import { WishlistAnalyticsService } from "./wishlist/wishlist-analytics.service";

@ApiTags("analytics")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("analytics/wishlist")
export class AnalyticsWishlistController {
  constructor(private readonly wishlist: WishlistAnalyticsService) {}

  @Get("summary")
  @ApiOperation({
    summary: "Wishlist analytics KPI",
    description:
      "Active wishlist demand created in the selected period: request count, unique " +
      "product/variant demand, potential revenue and profit vs the previous equal-length period.",
  })
  @ApiOkResponse({ type: AnalyticsWishlistSummaryResponseDto })
  async getSummary(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsQueryDto,
  ): Promise<AnalyticsWishlistSummaryResponseDto> {
    return this.wishlist.getSummary(this.requireNumericOwnerId(req), query);
  }

  @Get("unmet-demand")
  @ApiOperation({
    summary: "Wishlist unmet demand",
    description:
      "Currently active wishlist demand that exceeds available stock, aggregated at variant level.",
  })
  @ApiOkResponse({ type: AnalyticsWishlistUnmetDemandResponseDto })
  async getUnmetDemand(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsWishlistUnmetDemandQueryDto,
  ): Promise<AnalyticsWishlistUnmetDemandResponseDto> {
    return this.wishlist.getUnmetDemand(this.requireNumericOwnerId(req), query);
  }

  @Get("potential-sales")
  @ApiOperation({
    summary: "Wishlist potential sales",
    description:
      "Currently active wishlist demand that can be fulfilled from available stock now " +
      "(sellableQty = min(waitingCount, availableQty)).",
  })
  @ApiOkResponse({ type: AnalyticsWishlistPotentialSalesResponseDto })
  async getPotentialSales(
    @Req() req: { user?: AuthUser },
    @Query() query: AnalyticsWishlistPotentialSalesQueryDto,
  ): Promise<AnalyticsWishlistPotentialSalesResponseDto> {
    return this.wishlist.getPotentialSales(
      this.requireNumericOwnerId(req),
      query,
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
