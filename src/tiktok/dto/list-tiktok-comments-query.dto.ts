import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class ListTikTokCommentsQueryDto {
  @ApiPropertyOptional({
    description:
      "TikTok video id to list comments for. Required unless provided as path param.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  videoId?: string;

  @ApiPropertyOptional({
    description:
      "`tiktok_integrations.id` from GET /integrations. " +
      "When omitted, uses the latest CONNECTED TikTok integration for the owner.",
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  integrationId?: number;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 50,
    description: "Page size (`max_count` sent to TikTok). Default 20, max 50.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxCount?: number;

  @ApiPropertyOptional({
    description:
      "Pagination cursor from the previous response (`cursor`). " +
      "TikTok returns at most the top ~1000 comments per video.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cursor?: number;
}
