import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { InventoryMovementReason } from "../../database/entities/inventory-movement-reason.enum";
import { InventoryMovementType } from "../../database/entities/inventory-movement-type.enum";

export class InventoryMovementUserDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;
}

export class InventoryMovementItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: InventoryMovementType })
  type: InventoryMovementType;

  @ApiProperty({ enum: InventoryMovementReason })
  reason: InventoryMovementReason;

  @ApiProperty()
  quantityDelta: number;

  @ApiProperty()
  quantityBefore: number;

  @ApiProperty()
  quantityAfter: number;

  @ApiPropertyOptional({ nullable: true })
  purchasePrice: number | null;

  @ApiProperty()
  stockCostBefore: number;

  @ApiProperty()
  stockCostAfter: number;

  @ApiPropertyOptional({ nullable: true })
  averagePurchasePriceBefore: number | null;

  @ApiPropertyOptional({ nullable: true })
  averagePurchasePriceAfter: number | null;

  @ApiPropertyOptional({ nullable: true })
  comment: string | null;

  @ApiPropertyOptional({ type: InventoryMovementUserDto, nullable: true })
  createdByUser: InventoryMovementUserDto | null;

  @ApiProperty()
  createdAt: Date;
}

export class InventoryMovementListResponseDto {
  @ApiProperty({ type: [InventoryMovementItemDto] })
  items: InventoryMovementItemDto[];

  @ApiProperty()
  total: number;
}

export class InventoryVariantStateDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  reservedQuantity: number;

  @ApiProperty()
  availableQuantity: number;

  /** @deprecated Use `quantity` */
  @ApiProperty()
  stockQty: number;

  @ApiProperty()
  stockCostTotal: number;

  @ApiPropertyOptional({ nullable: true })
  averagePurchasePrice: number | null;
}

export class CreateInventoryMovementResponseDto {
  @ApiProperty({ type: InventoryMovementItemDto })
  movement: InventoryMovementItemDto;

  @ApiProperty({ type: InventoryVariantStateDto })
  variant: InventoryVariantStateDto;
}
