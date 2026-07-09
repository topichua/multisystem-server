import { ApiProperty } from "@nestjs/swagger";

export class AnalyticsSalesChannelItemDto {
  @ApiProperty({ example: "Instagram" })
  name: string;

  @ApiProperty({ example: 237 })
  orders: number;

  @ApiProperty({ example: 58 })
  percent: number;
}

export class AnalyticsSalesChannelsResponseDto {
  @ApiProperty({ example: 408 })
  totalOrders: number;

  @ApiProperty({ type: [AnalyticsSalesChannelItemDto] })
  channels: AnalyticsSalesChannelItemDto[];
}

export class AnalyticsOrdersByStatusItemDto {
  @ApiProperty({ example: 12 })
  statusId: number;

  @ApiProperty({ example: "Виконано" })
  name: string;

  @ApiProperty({ nullable: true, example: "#00C853" })
  color: string | null;

  @ApiProperty({ example: 168 })
  count: number;

  @ApiProperty({ example: 41 })
  percent: number;
}

export class AnalyticsOrdersByStatusResponseDto {
  @ApiProperty({ type: [AnalyticsOrdersByStatusItemDto] })
  statuses: AnalyticsOrdersByStatusItemDto[];
}

export class AnalyticsTopProductItemDto {
  @ApiProperty({ example: 65 })
  productId: number;

  @ApiProperty({ example: 311 })
  variantId: number;

  @ApiProperty({ example: "Black Wide Jeans" })
  name: string;

  @ApiProperty({ nullable: true })
  image: string | null;

  @ApiProperty({ example: 220100 })
  revenue: number;

  @ApiProperty({ example: 142 })
  soldQuantity: number;
}

export class AnalyticsTopProductsResponseDto {
  @ApiProperty({ type: [AnalyticsTopProductItemDto] })
  products: AnalyticsTopProductItemDto[];
}

export class AnalyticsTopCustomerItemDto {
  @ApiProperty({ example: 19 })
  clientId: number;

  @ApiProperty({ example: "Вікторія Гречко" })
  name: string;

  @ApiProperty({ nullable: true })
  avatar: string | null;

  @ApiProperty({ example: 3 })
  orders: number;

  @ApiProperty({ example: 16400 })
  spent: number;
}

export class AnalyticsTopCustomersResponseDto {
  @ApiProperty({ type: [AnalyticsTopCustomerItemDto] })
  customers: AnalyticsTopCustomerItemDto[];
}
