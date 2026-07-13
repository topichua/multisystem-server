import { ApiProperty } from "@nestjs/swagger";
import { InventoryMode } from "../../database/entities/inventory-mode.enum";
import { WorkspaceLanguage } from "../../database/entities/workspace-language.enum";

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
    example: InventoryMode.simple,
    description:
      "Inventory management mode. `simple` — deduct on completed only; `advanced` — reserve on confirmed, deduct on completed, release on cancelled.",
  })
  inventoryMode: InventoryMode;

  @ApiProperty({
    enum: WorkspaceLanguage,
    description: "Workspace language: ua (Ukrainian) or en (English).",
  })
  language: WorkspaceLanguage;
}
