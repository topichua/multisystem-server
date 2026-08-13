import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsString,
  Matches,
} from "class-validator";
import { InventoryMode } from "../../database/entities/inventory-mode.enum";
import { WorkspaceLanguage } from "../../database/entities/workspace-language.enum";
import {
  WORK_WEEKDAY_KEYS,
  type WorkWeekdayKey,
} from "../work-schedule/work-schedule.types";

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class WorkDayHoursDto {
  @ApiProperty({ example: "09:00", description: "Start `HH:mm`" })
  @IsString()
  @Matches(HH_MM, { message: "start must be HH:mm" })
  start!: string;

  @ApiProperty({ example: "19:00", description: "End `HH:mm`" })
  @IsString()
  @Matches(HH_MM, { message: "end must be HH:mm" })
  end!: string;
}

export class WorkspaceWorkScheduleDto {
  @ApiProperty({
    example: "09:00",
    description: "Default day start (local to workspace timezone).",
  })
  @IsString()
  @Matches(HH_MM, { message: "dayStart must be HH:mm" })
  dayStart!: string;

  @ApiProperty({
    example: "19:00",
    description: "Default day end (local to workspace timezone).",
  })
  @IsString()
  @Matches(HH_MM, { message: "dayEnd must be HH:mm" })
  dayEnd!: string;

  @ApiProperty({
    type: [String],
    enum: WORK_WEEKDAY_KEYS,
    example: ["mon", "tue", "wed", "thu", "fri"],
    description:
      "Working weekdays. Unselected days are days off — deferred sends move to the next working day.",
  })
  @IsArray()
  @ArrayUnique()
  @IsIn([...WORK_WEEKDAY_KEYS], { each: true })
  workDays!: WorkWeekdayKey[];

  @ApiProperty({
    example: false,
    description:
      "When true, use `dayHours` for each working day instead of dayStart/dayEnd.",
  })
  @IsBoolean()
  differentHoursPerDay!: boolean;

  @ApiProperty({
    description:
      "Per-day hours when `differentHoursPerDay` is true. Keys: mon…sun.",
    example: {
      sat: { start: "10:00", end: "16:00" },
    },
  })
  @IsObject()
  dayHours!: Record<string, WorkDayHoursDto>;
}

export class WorkspaceSettingsResponseDto {
  @ApiProperty()
  workspaceId!: number;

  @ApiProperty({
    description:
      "Workspace default currency (ISO-style code, e.g. UAH, USD). Used as catalog default when creating products without `currency`.",
    example: "UAH",
  })
  currency!: string;

  @ApiProperty({
    enum: InventoryMode,
    example: InventoryMode.simple,
    description:
      "Inventory management mode. `simple` — deduct on completed only; `advanced` — reserve on confirmed, deduct on completed, release on cancelled.",
  })
  inventoryMode!: InventoryMode;

  @ApiProperty({
    enum: WorkspaceLanguage,
    description: "Workspace language: ua (Ukrainian) or en (English).",
  })
  language!: WorkspaceLanguage;

  @ApiProperty({
    description: "Whether client wishlist is enabled for this workspace.",
    example: false,
  })
  wishlistEnabled!: boolean;

  @ApiProperty({
    example: "Europe/Kyiv",
    description: "IANA timezone for work schedule evaluation.",
  })
  timezone!: string;

  @ApiProperty({
    type: WorkspaceWorkScheduleDto,
    description:
      "Work schedule (графіфік роботи). Automatic messages and reminders are sent only during these hours.",
  })
  workSchedule!: WorkspaceWorkScheduleDto;
}
