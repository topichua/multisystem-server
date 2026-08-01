import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from "class-validator";

export enum ListStockSuppliesStatusFilter {
  all = "all",
  applied = "applied",
  pending = "pending",
}

/** Alias for UI copy «not applied». */
export enum ListStockSuppliesByFilter {
  all = "all",
  applied = "applied",
  not_applied = "not_applied",
}

export class ListStockSuppliesQueryDto {
  @ApiPropertyOptional({
    enum: ListStockSuppliesByFilter,
    description:
      "`all` | `applied` | `not_applied` (pending). Alias of `status` when both set, `by` wins.",
    default: ListStockSuppliesByFilter.all,
  })
  @IsOptional()
  @IsEnum(ListStockSuppliesByFilter)
  by?: ListStockSuppliesByFilter;

  @ApiPropertyOptional({
    enum: ListStockSuppliesStatusFilter,
    description: "`all` | `applied` | `pending`. Prefer `by` for UI wording.",
  })
  @IsOptional()
  @IsEnum(ListStockSuppliesStatusFilter)
  status?: ListStockSuppliesStatusFilter;

  @ApiPropertyOptional({
    description: "Created-at range start (ISO date or datetime).",
    example: "2026-07-01",
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    description: "Created-at range end (ISO date or datetime).",
    example: "2026-07-31",
  })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({
    description: "Filter by user who created the supply (`stock_supplies.user_id`).",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  createdBy?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
