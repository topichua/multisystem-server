import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  StockMovementItemDto,
  VariantStockDto,
} from "./stock-response.dto";

export class StockSupplyItemResponseDto {
  @ApiProperty()
  productId: number;

  @ApiProperty()
  productVariantId: number;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  buyPrice: number;
}

export class StockSupplyResponseDto {
  @ApiProperty()
  id: number;

  @ApiPropertyOptional({ nullable: true })
  comment: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ type: [StockSupplyItemResponseDto] })
  items: StockSupplyItemResponseDto[];
}

export class StockSupplyLineResultDto {
  @ApiProperty({ type: StockSupplyItemResponseDto })
  item: StockSupplyItemResponseDto;

  @ApiProperty({ type: StockMovementItemDto })
  movement: StockMovementItemDto;

  @ApiProperty({ type: VariantStockDto })
  stock: VariantStockDto;
}

export class CreateStockSupplyResponseDto {
  @ApiProperty({ type: StockSupplyResponseDto })
  supply: StockSupplyResponseDto;

  @ApiProperty({ type: [StockSupplyLineResultDto] })
  lines: StockSupplyLineResultDto[];
}
