import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { InventoryMode } from "../../database/entities/inventory-mode.enum";
import { WorkspaceLanguage } from "../../database/entities/workspace-language.enum";
import { WorkDayHoursDto } from "./workspace-settings-response.dto";
import {
  WORK_WEEKDAY_KEYS,
  type WorkWeekdayKey,
} from "../work-schedule/work-schedule.types";

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

function pickWishlistEnabled(
  obj: Record<string, unknown>,
): boolean | undefined {
  if (obj.wishlistEnabled !== undefined) {
    return obj.wishlistEnabled as boolean;
  }
  if (obj.wishlist_enabled !== undefined) {
    return obj.wishlist_enabled as boolean;
  }
  return undefined;
}

export class UpdateWorkspaceWorkScheduleDto {
  @ApiPropertyOptional({ example: "09:00" })
  @IsOptional()
  @IsString()
  @Matches(HH_MM, { message: "dayStart must be HH:mm" })
  dayStart?: string;

  @ApiPropertyOptional({ example: "19:00" })
  @IsOptional()
  @IsString()
  @Matches(HH_MM, { message: "dayEnd must be HH:mm" })
  dayEnd?: string;

  @ApiPropertyOptional({
    type: [String],
    enum: WORK_WEEKDAY_KEYS,
    example: ["wed", "thu", "fri", "sat"],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn([...WORK_WEEKDAY_KEYS], { each: true })
  workDays?: WorkWeekdayKey[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  differentHoursPerDay?: boolean;

  @ApiPropertyOptional({
    description: "Map of weekday → { start, end }",
    example: {
      wed: { start: "09:00", end: "19:00" },
      sat: { start: "10:00", end: "16:00" },
    },
  })
  @IsOptional()
  @IsObject()
  dayHours?: Record<string, WorkDayHoursDto>;
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
    example: InventoryMode.simple,
    description:
      "Inventory management mode. `simple` (default) — stock is deducted when an order reaches completed status; `advanced` — stock is reserved on confirmed, deducted on completed, released on cancelled. Also accepted as `inventory_mode`.",
  })
  @IsOptional()
  @Transform(({ obj }) => pickInventoryMode(obj as Record<string, unknown>))
  @IsEnum(InventoryMode)
  inventoryMode?: InventoryMode;

  @IsOptional()
  @IsEnum(InventoryMode)
  inventory_mode?: InventoryMode;

  @ApiPropertyOptional({
    enum: WorkspaceLanguage,
    description: "Workspace language: ua (Ukrainian) or en (English).",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEnum(WorkspaceLanguage)
  language?: WorkspaceLanguage;

  @ApiPropertyOptional({
    description:
      "Enable client wishlist for this workspace. Also accepted as `wishlist_enabled`.",
    example: false,
  })
  @IsOptional()
  @Transform(({ obj }) => pickWishlistEnabled(obj as Record<string, unknown>))
  @IsBoolean()
  wishlistEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  wishlist_enabled?: boolean;

  @ApiPropertyOptional({
    example: "Europe/Kyiv",
    description: "IANA timezone used for work schedule.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({
    type: UpdateWorkspaceWorkScheduleDto,
    description: "Work schedule (графіфік роботи). Partial merge with current.",
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateWorkspaceWorkScheduleDto)
  workSchedule?: UpdateWorkspaceWorkScheduleDto;
}
