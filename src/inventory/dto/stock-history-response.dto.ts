import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { StockMovementType } from "../../database/entities/stock-movement-type.enum";

export class StockHistoryUserDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;
}

export class StockHistorySupplyItemDto {
  @ApiProperty()
  movementId: number;

  @ApiProperty()
  productId: number;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  variantId: number;

  @ApiPropertyOptional({ nullable: true })
  variantName: string | null;

  @ApiPropertyOptional({ nullable: true })
  sku: string | null;

  @ApiProperty()
  quantityChange: number;

  @ApiPropertyOptional({ nullable: true })
  purchasePrice: number | null;
}

export class StockHistorySupplyEntryDto {
  @ApiProperty({ enum: ["supply"] })
  kind: "supply";

  @ApiProperty()
  id: number;

  @ApiProperty({ enum: StockMovementType })
  type: StockMovementType.supply;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ nullable: true })
  comment: string | null;

  @ApiPropertyOptional({ type: StockHistoryUserDto, nullable: true })
  user: StockHistoryUserDto | null;

  @ApiProperty()
  totalQuantityChange: number;

  @ApiProperty()
  itemCount: number;

  @ApiProperty({ type: [StockHistorySupplyItemDto] })
  items: StockHistorySupplyItemDto[];
}

export class StockHistoryMovementEntryDto {
  @ApiProperty({ enum: ["movement"] })
  kind: "movement";

  @ApiProperty()
  id: number;

  @ApiProperty({ enum: StockMovementType })
  type: StockMovementType;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ nullable: true })
  reason: string | null;

  @ApiPropertyOptional({ nullable: true })
  comment: string | null;

  @ApiPropertyOptional({ type: StockHistoryUserDto, nullable: true })
  user: StockHistoryUserDto | null;

  @ApiProperty()
  productId: number;

  @ApiProperty()
  productName: string;

  @ApiProperty()
  variantId: number;

  @ApiPropertyOptional({ nullable: true })
  variantName: string | null;

  @ApiPropertyOptional({ nullable: true })
  sku: string | null;

  @ApiProperty()
  quantityChange: number;

  @ApiPropertyOptional({ nullable: true })
  purchasePrice: number | null;

  @ApiPropertyOptional({ nullable: true })
  totalCostChange: number | null;

  @ApiPropertyOptional({ nullable: true })
  stockBefore: number | null;

  @ApiPropertyOptional({ nullable: true })
  stockAfter: number | null;
}

export class StockHistoryListResponseDto {
  @ApiProperty({
    description:
      "Merged history entries. Each item is either a grouped supply batch (`kind: supply`) or a single movement (`kind: movement`).",
    isArray: true,
  })
  items: Array<StockHistorySupplyEntryDto | StockHistoryMovementEntryDto>;

  @ApiProperty()
  total: number;
}
