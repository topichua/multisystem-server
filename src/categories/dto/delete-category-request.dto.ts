import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Min, ValidateIf } from "class-validator";

export class DeleteCategoryRequestDto {
  @ApiPropertyOptional({
    nullable: true,
    description:
      "Reassign products from the deleted category to this category. " +
      "Omit or pass `null` to leave products uncategorized (`categoryId: null`).",
    example: 12,
  })
  @IsOptional()
  @ValidateIf(
    (o: { categoryId?: unknown }) =>
      o.categoryId !== undefined && o.categoryId !== null,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number | null;
}
