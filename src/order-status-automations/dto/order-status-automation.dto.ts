import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { AutomationActionType } from "../../database/entities/automation-action-type.enum";
import { AutomationDurationUnit } from "../../database/entities/automation-duration-unit.enum";
import { AutomationSourceType } from "../../database/entities/automation-source-type.enum";

export class CreateOrderStatusAutomationDto {
  @ApiProperty({ example: "Довго на відділенні" })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ enum: AutomationSourceType })
  @IsEnum(AutomationSourceType)
  sourceType!: AutomationSourceType;

  @ApiProperty({ example: "at_branch" })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sourceStatus!: string;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((o) => o.durationUnit != null)
  @IsInt()
  @IsPositive()
  durationValue?: number | null;

  @ApiPropertyOptional({ enum: AutomationDurationUnit, nullable: true })
  @ValidateIf((o) => o.durationValue != null)
  @IsEnum(AutomationDurationUnit)
  durationUnit?: AutomationDurationUnit | null;

  @ApiProperty({
    enum: AutomationActionType,
    default: AutomationActionType.change_order_status,
  })
  @IsEnum(AutomationActionType)
  actionType: AutomationActionType = AutomationActionType.change_order_status;

  @ApiProperty()
  @IsInt()
  @IsPositive()
  targetOrderStatusId!: number;
}

export class UpdateOrderStatusAutomationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: AutomationSourceType })
  @IsOptional()
  @IsEnum(AutomationSourceType)
  sourceType?: AutomationSourceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sourceStatus?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.durationUnit != null)
  @IsInt()
  @IsPositive()
  durationValue?: number | null;

  @ApiPropertyOptional({ enum: AutomationDurationUnit, nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.durationValue != null)
  @IsEnum(AutomationDurationUnit)
  durationUnit?: AutomationDurationUnit | null;

  @ApiPropertyOptional({ enum: AutomationActionType })
  @IsOptional()
  @IsEnum(AutomationActionType)
  actionType?: AutomationActionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  targetOrderStatusId?: number;
}

export class SetOrderStatusAutomationActiveDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

export class ListOrderStatusAutomationsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: AutomationSourceType })
  @IsOptional()
  @IsEnum(AutomationSourceType)
  sourceType?: AutomationSourceType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  pageSize?: number;
}
