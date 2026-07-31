import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class ListTikTokVideosQueryDto {
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
    maximum: 20,
    description: "Page size (`max_count`). Default 20, max 20 (TikTok limit).",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  maxCount?: number;

  @ApiPropertyOptional({
    description:
      "Pagination cursor from the previous response (`cursor`). " +
      "TikTok cursors are UTC Unix timestamps in milliseconds.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cursor?: number;
}
