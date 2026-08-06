import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }
  return undefined;
}

export class ListCategoriesQueryDto {
  @ApiPropertyOptional({
    description:
      "When `true` (default), each category includes `productCount` (distinct products " +
      "assigned to this category) and `productVariantCount` (variants of those products). " +
      "Pass `false` to skip count queries.",
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => parseOptionalBoolean(value))
  @IsBoolean()
  withCounters?: boolean;
}
