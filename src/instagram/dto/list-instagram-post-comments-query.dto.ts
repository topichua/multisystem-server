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

export class ListInstagramPostCommentsQueryDto {
  @ApiPropertyOptional({
    description:
      "`instagram_integration.id` from GET /api/instagram/integrations. " +
      "When omitted, uses the latest connected integration for your workspace.",
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  integrationId?: number;

  @ApiPropertyOptional({
    default: 25,
    minimum: 1,
    maximum: 50,
    description: "Page size passed to Graph `limit` (max 50 for comments).",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({
    description:
      "Graph cursor for the next page. Use `paging.cursors.after` from the previous response.",
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === "") return undefined;
    const s = typeof value === "string" ? value.trim() : String(value).trim();
    return s.length > 0 ? s : undefined;
  })
  @IsString()
  @MinLength(1)
  after?: string;

  @ApiPropertyOptional({
    description:
      "Graph cursor for the previous page. Use `paging.cursors.before` from the previous response.",
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === "") return undefined;
    const s = typeof value === "string" ? value.trim() : String(value).trim();
    return s.length > 0 ? s : undefined;
  })
  @IsString()
  @MinLength(1)
  before?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      "When true, embeds full reply objects in each comment (heavier Graph request). " +
      "Default false: only returns lightweight `reply_count` / `has_replies`; load replies via " +
      "GET /api/instagram/posts/:id/comments/:commentId/replies.",
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === "true" || value === 1 || value === "1") {
      return true;
    }
    if (value === false || value === "false" || value === 0 || value === "0") {
      return false;
    }
    return undefined;
  })
  @IsBoolean()
  include_replies?: boolean;
}
