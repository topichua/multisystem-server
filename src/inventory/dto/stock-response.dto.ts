import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { StockMovementType } from "../../database/entities/stock-movement-type.enum";

export class StockMovementUserDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;
}

export class StockMovementItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: StockMovementType })
  type: StockMovementType;

  @ApiPropertyOptional({ nullable: true, example: "брак" })
  reason: string | null;

  @ApiProperty()
  quantityChange: number;

  @ApiPropertyOptional({ nullable: true })
  purchasePrice: number | null;

  @ApiPropertyOptional({ nullable: true })
  totalCostChange: number | null;

  @ApiPropertyOptional({ nullable: true })
  comment: string | null;

  @ApiPropertyOptional({ nullable: true })
  orderId: number | null;

  @ApiPropertyOptional({ nullable: true })
  orderItemId: number | null;

  @ApiPropertyOptional({ type: StockMovementUserDto, nullable: true })
  user: StockMovementUserDto | null;

  @ApiProperty()
  createdAt: Date;
}

export class VariantStockDto {
  @ApiProperty()
  variantId: number;

  @ApiProperty()
  quantity: number;

  @ApiPropertyOptional({ nullable: true })
  avgPurchasePrice: number | null;

  @ApiPropertyOptional({ nullable: true })
  totalCost: number | null;

  @ApiProperty()
  stockInitialized: boolean;

  @ApiProperty({
    description: "Advanced mode: false until initial stock is recorded.",
  })
  requiresInitialization: boolean;
}

export class StockOperationResponseDto {
  @ApiProperty({ type: StockMovementItemDto })
  movement: StockMovementItemDto;

  @ApiProperty({ type: VariantStockDto })
  stock: VariantStockDto;
}

export class StockMovementListResponseDto {
  @ApiProperty({ type: [StockMovementItemDto] })
  items: StockMovementItemDto[];

  @ApiProperty()
  total: number;
}

export class ProductStockListResponseDto {
  @ApiProperty()
  productId: number;

  @ApiProperty({ type: [VariantStockDto] })
  variants: Array<
    VariantStockDto & {
      sku: string | null;
      name: string | null;
    }
  >;
}
