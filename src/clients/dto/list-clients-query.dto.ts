import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }
  return undefined;
}

function trimOptionalString(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const s = typeof value === "string" ? value.trim() : String(value).trim();
  return s.length > 0 ? s : undefined;
}

/**
 * GET /clients — lookup by `id`, `instagramUserId` / `instagramId`, or `telegramUserId`
 * (at most one), or paginated list when none are set.
 */
export class ListClientsQueryDto {
  @ApiPropertyOptional({
    description:
      "If set, response is a single-client lookup (`ClientLookupResponseDto`); `page` / `pageSize` are ignored.",
    example: 42,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id?: number;

  @ApiPropertyOptional({
    description:
      "Instagram user id (PSID). Same lookup as `instagramId`. `page` / `pageSize` are ignored.",
    example: "17841400008460056",
  })
  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MinLength(1)
  instagramUserId?: string;

  @ApiPropertyOptional({
    description:
      "Alias for `instagramUserId`. `page` / `pageSize` are ignored when set.",
    example: "17841400008460056",
  })
  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MinLength(1)
  instagramId?: string;

  @ApiPropertyOptional({
    description:
      "Telegram user id. `page` / `pageSize` are ignored when set.",
    example: "123456789",
  })
  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MinLength(1)
  telegramUserId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @ApiPropertyOptional({
    description:
      "When true, each client includes `orderStats` (order count, total spent, average order price, last order date). `avatar_src` is always included on GET.",
    example: true,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseOptionalBoolean(value))
  @IsBoolean()
  include_order_stat?: boolean;
}
