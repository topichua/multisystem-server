import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { InventoryMovementReason } from "../../database/entities/inventory-movement-reason.enum";
import { InventoryMovementType } from "../../database/entities/inventory-movement-type.enum";

export class CreateInventoryMovementRequestDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  variantId: number;

  @ApiProperty({ enum: InventoryMovementType })
  @IsEnum(InventoryMovementType)
  type: InventoryMovementType;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ enum: InventoryMovementReason })
  @IsEnum(InventoryMovementReason)
  reason: InventoryMovementReason;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}
