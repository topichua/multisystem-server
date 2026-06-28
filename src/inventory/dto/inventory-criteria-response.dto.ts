import { ApiProperty } from "@nestjs/swagger";
import { InventoryMovementReason } from "../../database/entities/inventory-movement-reason.enum";
import { InventoryMovementType } from "../../database/entities/inventory-movement-type.enum";

export class InventoryMovementCriteriaItemDto {
  @ApiProperty({ enum: InventoryMovementType })
  type: InventoryMovementType;

  @ApiProperty({
    enum: InventoryMovementReason,
    isArray: true,
    description: "Reasons allowed for manual movements of this type.",
  })
  reasons: InventoryMovementReason[];
}

export class InventoryMovementCriteriaResponseDto {
  @ApiProperty({
    enum: InventoryMovementType,
    isArray: true,
    description: "All movement type options.",
  })
  type: InventoryMovementType[];

  @ApiProperty({
    enum: InventoryMovementReason,
    isArray: true,
    description:
      "All movement reason options for manual movements (excludes system-only order_sale).",
  })
  reason: InventoryMovementReason[];

  @ApiProperty({
    type: [InventoryMovementCriteriaItemDto],
    description: "Allowed reasons per type (for dependent dropdowns).",
  })
  items: InventoryMovementCriteriaItemDto[];
}
