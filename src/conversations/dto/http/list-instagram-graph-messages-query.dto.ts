import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from "class-validator";

export class ListInstagramGraphMessagesQueryDto {
  @ApiPropertyOptional({
    default: 25,
    minimum: 1,
    maximum: 100,
    description: "Page size passed to Graph `limit` (max 100).",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
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
}
