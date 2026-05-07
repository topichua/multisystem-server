import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";

/** GET /clients — either `instagramId` (lookup one) or paging (list workspace clients). */
export class ListClientsQueryDto {
  @ApiPropertyOptional({
    description:
      "If set, response is a single-client lookup (`ClientLookupResponseDto`); `page` / `pageSize` are ignored.",
    example: "17841400008460056",
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === "") return undefined;
    const s = typeof value === "string" ? value.trim() : String(value).trim();
    return s.length > 0 ? s : undefined;
  })
  @IsString()
  @MinLength(1)
  instagramId?: string;

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
}
