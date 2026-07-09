import { ApiProperty } from "@nestjs/swagger";
import type { WorkspaceEntitlementsSnapshot } from "../types/workspace-entitlements.interface";

export class PlanTemplateResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ example: "starter" })
  slug: string;

  @ApiProperty({ example: "Starter" })
  name: string;

  @ApiProperty()
  isPublic: boolean;

  @ApiProperty({
    example: {
      socialAccountsLimit: 2,
      privateAccountsLimit: 1,
      wishlistEnabled: true,
      advancedInventoryEnabled: false,
      advancedAnalyticsEnabled: false,
      aiCreditsMonthly: 100,
    },
  })
  entitlements: WorkspaceEntitlementsSnapshot;

  @ApiProperty({ example: 490 })
  priceMonthly: number;

  @ApiProperty({ example: 4900 })
  priceYearly: number;

  @ApiProperty({ example: "UAH" })
  currency: string;

  @ApiProperty()
  sortOrder: number;
}
