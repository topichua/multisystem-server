import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from "class-validator";
import type { WorkspaceEntitlementsSnapshot } from "../types/workspace-entitlements.interface";

class AdminEntitlementsDto implements WorkspaceEntitlementsSnapshot {
  @ApiPropertyOptional({ nullable: true, example: null })
  @IsOptional()
  socialAccountsLimit: number | null;

  @ApiPropertyOptional({ nullable: true, example: null })
  @IsOptional()
  privateAccountsLimit: number | null;

  @ApiProperty()
  @IsBoolean()
  wishlistEnabled: boolean;

  @ApiProperty()
  @IsBoolean()
  advancedInventoryEnabled: boolean;

  @ApiProperty()
  @IsBoolean()
  advancedAnalyticsEnabled: boolean;

  @ApiProperty({ example: 10000 })
  @IsInt()
  @Min(0)
  aiCreditsMonthly: number;
}

export class UpdateWorkspaceEntitlementsRequestDto {
  @ApiProperty({ type: AdminEntitlementsDto })
  @ValidateNested()
  @Type(() => AdminEntitlementsDto)
  entitlements: AdminEntitlementsDto;

  @ApiPropertyOptional({ example: "Enterprise custom for Acme" })
  @IsOptional()
  customLabel?: string;
}
