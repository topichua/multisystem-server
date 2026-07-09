import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type {
  WorkspaceEntitlementsSnapshot,
  WorkspaceEntitlementsUsage,
} from "../types/workspace-entitlements.interface";

export class WorkspaceEntitlementsUsageDto implements WorkspaceEntitlementsUsage {
  @ApiProperty({ example: 2 })
  socialAccounts: number;

  @ApiProperty({ example: 1 })
  privateAccounts: number;

  @ApiProperty({ example: 240 })
  aiCreditsUsed: number;
}

export class WorkspaceEntitlementsResponseDto
  implements WorkspaceEntitlementsSnapshot
{
  @ApiProperty({ nullable: true, example: 5 })
  socialAccountsLimit: number | null;

  @ApiProperty({ nullable: true, example: 3 })
  privateAccountsLimit: number | null;

  @ApiProperty()
  wishlistEnabled: boolean;

  @ApiProperty()
  advancedInventoryEnabled: boolean;

  @ApiProperty()
  advancedAnalyticsEnabled: boolean;

  @ApiProperty({ example: 1000 })
  aiCreditsMonthly: number;

  @ApiProperty({ example: 240 })
  aiCreditsUsed: number;

  @ApiPropertyOptional({ nullable: true })
  creditsResetAt: string | null;

  @ApiProperty({ type: WorkspaceEntitlementsUsageDto })
  usage: WorkspaceEntitlementsUsageDto;
}
