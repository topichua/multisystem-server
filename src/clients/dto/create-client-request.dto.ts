import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import {
  appendSingularToArray,
  normalizeStringArray,
} from "./client-link-input.util";

export class CreateClientRequestDto {
  @ApiPropertyOptional({
    description: "Optional; stored as empty string if omitted.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  first_name?: string;

  @ApiPropertyOptional({
    description: "Optional; stored as empty string if omitted.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  last_name?: string;

  @ApiPropertyOptional({
    description: "Optional; stored as empty string if omitted.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      "Instagram scoped user ids (`client_links.external_id`, provider `instagram`).",
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
      "Telegram user ids (`client_links.external_id`, provider `telegram`).",
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
    description: "Deprecated alias — appended to `instagramUserIds` when set.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  instagramUserId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    deprecated: true,
    description: "Deprecated alias — appended to `telegramUserIds` when set.",
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
    const singular =
      this.instagramUserId !== undefined ? this.instagramUserId : this.instagramId;
    const merged = appendSingularToArray(this.instagramUserIds, singular);
    if (merged === undefined) {
      return undefined;
    }
    return [...new Set(merged)];
  }

  resolvedTelegramUserIds(): string[] | undefined {
    const merged = appendSingularToArray(this.telegramUserIds, this.telegramUserId);
    if (merged === undefined) {
      return undefined;
    }
    return [...new Set(merged)];
  }
}
