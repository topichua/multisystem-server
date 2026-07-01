import { ApiProperty } from "@nestjs/swagger";
import { InventoryMode } from "../../database/entities/inventory-mode.enum";

export class WorkspaceSettingsResponseDto {
  @ApiProperty()
  workspaceId: number;

  @ApiProperty({
    description:
      "Workspace default currency (ISO-style code, e.g. UAH, USD). Used as catalog default when creating products without `currency`.",
    example: "UAH",
  })
  currency: string;

  @ApiProperty({
    enum: InventoryMode,
    description:
      "simple — editable quantity, no cost tracking; advanced — inventory movements and profit calculation.",
  })
  inventoryMode: InventoryMode;
}
