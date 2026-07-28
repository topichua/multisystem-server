import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Min, ValidateIf } from "class-validator";

export class MoveCategoryRequestDto {
  @ApiPropertyOptional({
    nullable: true,
    description:
      "New parent category id. Pass `null` (or omit) to move the category to the top level.",
    example: 12,
  })
  @IsOptional()
  @ValidateIf(
    (o: { parentId?: unknown }) =>
      o.parentId !== undefined && o.parentId !== null,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parentId?: number | null;
}
