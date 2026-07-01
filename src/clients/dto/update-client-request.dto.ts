import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { normalizeStringArray } from "./client-link-input.util";

export class UpdateClientRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  first_name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  last_name?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  phone?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      "Replaces all Instagram links when set (`[]` clears). Stored in `client_links`.",
  })
  @IsOptional()
  @Transform(({ value }) => normalizeStringArray(value))
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  instagramUserIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      "Replaces all Telegram links when set (`[]` clears). Stored in `client_links`.",
  })
  @IsOptional()
  @Transform(({ value }) => normalizeStringArray(value))
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  telegramUserIds?: string[];

  @ApiPropertyOptional({
    nullable: true,
    deprecated: true,
    description:
      "Deprecated. When set without `instagramUserIds`, replaces Instagram links with this single id (null/empty clears).",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  instagramUserId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    deprecated: true,
    description:
      "Deprecated. When set without `telegramUserIds`, replaces Telegram links with this single id (null/empty clears).",
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  telegramUserId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    deprecated: true,
    description: "Deprecated alias for `instagramUserId`.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  instagramId?: string | null;

  resolvedInstagramUserIds(): string[] | undefined {
    if (this.instagramUserIds !== undefined) {
      return [...new Set(this.instagramUserIds)];
    }
    const singular =
      this.instagramUserId !== undefined ? this.instagramUserId : this.instagramId;
    if (singular === undefined) {
      return undefined;
    }
    if (singular === null) {
      return [];
    }
    const s = String(singular).trim();
    return s ? [s] : [];
  }

  resolvedTelegramUserIds(): string[] | undefined {
    if (this.telegramUserIds !== undefined) {
      return [...new Set(this.telegramUserIds)];
    }
    if (this.telegramUserId === undefined) {
      return undefined;
    }
    if (this.telegramUserId === null) {
      return [];
    }
    const s = String(this.telegramUserId).trim();
    return s ? [s] : [];
  }
}
