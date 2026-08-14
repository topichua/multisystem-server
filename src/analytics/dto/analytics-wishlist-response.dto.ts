import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AnalyticsWishlistKpiValueDto {
  @ApiProperty({ example: 42 })
  value: number;

  @ApiProperty({ example: 12.5, nullable: true })
  changePercent: number | null;
}

export class AnalyticsWishlistSummaryResponseDto {
  @ApiProperty({ type: AnalyticsWishlistKpiValueDto })
  wishlistRequests: AnalyticsWishlistKpiValueDto;

  @ApiProperty({ type: AnalyticsWishlistKpiValueDto })
  waitingProducts: AnalyticsWishlistKpiValueDto;

  @ApiProperty({ type: AnalyticsWishlistKpiValueDto })
  potentialRevenue: AnalyticsWishlistKpiValueDto;

  @ApiProperty({ type: AnalyticsWishlistKpiValueDto })
  potentialProfit: AnalyticsWishlistKpiValueDto;
}

export class AnalyticsWishlistPaginationDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty()
  hasNextPage: boolean;
}

export class AnalyticsWishlistDemandItemDto {
  @ApiProperty()
  productId: number;

  @ApiProperty({ nullable: true })
  variantId: number | null;

  @ApiProperty()
  productName: string;

  @ApiPropertyOptional({ nullable: true })
  variantName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  imageUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  categoryName?: string | null;

  @ApiProperty()
  waitingCount: number;

  @ApiProperty()
  availableQty: number;

  @ApiProperty()
  sellingPrice: number;

  @ApiProperty()
  potentialRevenue: number;

  @ApiProperty()
  potentialProfit: number;
}

export class AnalyticsWishlistUnmetDemandResponseDto {
  @ApiProperty({ type: [AnalyticsWishlistDemandItemDto] })
  items: AnalyticsWishlistDemandItemDto[];

  @ApiProperty({ type: AnalyticsWishlistPaginationDto })
  pagination: AnalyticsWishlistPaginationDto;
}

export class AnalyticsWishlistPotentialSalesItemDto extends AnalyticsWishlistDemandItemDto {
  @ApiProperty()
  sellableQty: number;
}

export class AnalyticsWishlistPotentialSalesSummaryDto {
  @ApiProperty()
  potentialRevenue: number;

  @ApiProperty()
  potentialProfit: number;

  @ApiProperty()
  sellableQty: number;

  @ApiProperty()
  productsCount: number;
}

export class AnalyticsWishlistPotentialSalesResponseDto {
  @ApiProperty({ type: AnalyticsWishlistPotentialSalesSummaryDto })
  summary: AnalyticsWishlistPotentialSalesSummaryDto;

  @ApiProperty({ type: [AnalyticsWishlistPotentialSalesItemDto] })
  items: AnalyticsWishlistPotentialSalesItemDto[];

  @ApiProperty({ type: AnalyticsWishlistPaginationDto })
  pagination: AnalyticsWishlistPaginationDto;
}
