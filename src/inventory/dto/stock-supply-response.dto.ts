import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  STOCK_SUPPLY_STATUSES,
  type StockSupplyStatus,
} from "../../database/entities/stock-supply-status";
import { StockMovementItemDto, VariantStockDto } from "./stock-response.dto";

export class StockSupplyUserDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;
}

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

  @ApiPropertyOptional({
    nullable: true,
    description: "Display name of the supply batch.",
  })
  name: string | null;

  @ApiProperty({ enum: STOCK_SUPPLY_STATUSES })
  status: StockSupplyStatus;

  @ApiPropertyOptional({ nullable: true })
  comment: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({
    nullable: true,
    description: "Set when status becomes `applied`.",
  })
  appliedAt: Date | null;

  @ApiPropertyOptional({ type: StockSupplyUserDto, nullable: true })
  createdBy: StockSupplyUserDto | null;

  @ApiProperty({ type: [StockSupplyItemResponseDto] })
  items: StockSupplyItemResponseDto[];
}

export class StockSupplyListResponseDto {
  @ApiProperty({ type: [StockSupplyResponseDto] })
  items: StockSupplyResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  offset: number;
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

  @ApiProperty({
    type: [StockSupplyLineResultDto],
    description: "Empty when the supply was created as pending.",
  })
  lines: StockSupplyLineResultDto[];
}

export class ApplyStockSupplyResponseDto {
  @ApiProperty({ type: StockSupplyResponseDto })
  supply: StockSupplyResponseDto;

  @ApiProperty({ type: [StockSupplyLineResultDto] })
  lines: StockSupplyLineResultDto[];
}
