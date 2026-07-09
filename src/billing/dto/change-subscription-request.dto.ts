import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { BillingCycle } from "../../database/entities/billing-cycle.enum";
import type { WorkspaceEntitlementsSnapshot } from "../types/workspace-entitlements.interface";

class EntitlementsOverrideDto implements WorkspaceEntitlementsSnapshot {
  @ApiPropertyOptional({ nullable: true, example: 5 })
  @IsOptional()
  socialAccountsLimit: number | null;

  @ApiPropertyOptional({ nullable: true, example: 3 })
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

  @ApiProperty({ example: 1000 })
  @IsInt()
  @Min(0)
  aiCreditsMonthly: number;
}

export class ChangeSubscriptionRequestDto {
  @ApiPropertyOptional({
    description: "Public plan template id or workspace-specific individual plan",
    example: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  planTemplateId?: number;

  @ApiPropertyOptional({ enum: BillingCycle, default: BillingCycle.monthly })
  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @ApiPropertyOptional({
    description: "Custom entitlements override (admin flows)",
    type: EntitlementsOverrideDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EntitlementsOverrideDto)
  entitlements?: EntitlementsOverrideDto;

  @ApiPropertyOptional({
    description: "Label for custom subscription when entitlements are overridden",
    example: "Enterprise custom",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  customLabel?: string;
}
