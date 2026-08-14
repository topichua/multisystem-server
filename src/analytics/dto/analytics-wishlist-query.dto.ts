import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { AnalyticsQueryDto } from "./analytics-query.dto";
import { WISHLIST_ANALYTICS_MAX_LIMIT } from "../wishlist/wishlist-analytics.logic";

export enum WishlistUnmetDemandSortBy {
  waitingCount = "waitingCount",
  potentialRevenue = "potentialRevenue",
  potentialProfit = "potentialProfit",
}

export enum WishlistPotentialSalesSortBy {
  sellableQty = "sellableQty",
  potentialRevenue = "potentialRevenue",
  potentialProfit = "potentialProfit",
}

export enum WishlistAnalyticsSortDirection {
  asc = "asc",
  desc = "desc",
}

export class AnalyticsWishlistPagedQueryDto extends AnalyticsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: WISHLIST_ANALYTICS_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(WISHLIST_ANALYTICS_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ enum: WishlistAnalyticsSortDirection })
  @IsOptional()
  @IsEnum(WishlistAnalyticsSortDirection)
  sortDirection?: WishlistAnalyticsSortDirection;
}

export class AnalyticsWishlistUnmetDemandQueryDto extends AnalyticsWishlistPagedQueryDto {
  @ApiPropertyOptional({
    enum: WishlistUnmetDemandSortBy,
    default: WishlistUnmetDemandSortBy.waitingCount,
  })
  @IsOptional()
  @IsEnum(WishlistUnmetDemandSortBy)
  sortBy?: WishlistUnmetDemandSortBy;
}

export class AnalyticsWishlistPotentialSalesQueryDto extends AnalyticsWishlistPagedQueryDto {
  @ApiPropertyOptional({
    enum: WishlistPotentialSalesSortBy,
    default: WishlistPotentialSalesSortBy.potentialRevenue,
  })
  @IsOptional()
  @IsEnum(WishlistPotentialSalesSortBy)
  sortBy?: WishlistPotentialSalesSortBy;
}
