import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { InventoryMode } from "../../database/entities/inventory-mode.enum";

function pickInventoryMode(
  obj: Record<string, unknown>,
): InventoryMode | undefined {
  const camel = obj.inventoryMode;
  if (camel !== undefined && camel !== null && camel !== "") {
    return camel as InventoryMode;
  }
  const snake = obj.inventory_mode;
  if (snake !== undefined && snake !== null && snake !== "") {
    return snake as InventoryMode;
  }
  return undefined;
}

export class UpdateWorkspaceSettingsDto {
  @ApiPropertyOptional({
    description:
      "Default currency for the workspace (3–8 chars, letters/digits).",
    example: "USD",
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value,
  )
  @MinLength(3)
  @MaxLength(8)
  @Matches(/^[A-Z0-9]+$/, {
    message: "currency must be 3–8 alphanumeric characters (e.g. UAH, USD)",
  })
  currency?: string;

  @ApiPropertyOptional({
    enum: InventoryMode,
    description:
      "Also accepted as `inventory_mode`. simple — editable quantity; advanced — inventory movements and cost tracking.",
  })
  @IsOptional()
  @Transform(({ obj }) => pickInventoryMode(obj as Record<string, unknown>))
  @IsEnum(InventoryMode)
  inventoryMode?: InventoryMode;

  @IsOptional()
  @IsEnum(InventoryMode)
  inventory_mode?: InventoryMode;
}
