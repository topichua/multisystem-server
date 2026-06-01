import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";
import { CreateProductVariantInputDto } from "./create-product-variant-input.dto";

export class UpdateProductVariantSyncDto extends CreateProductVariantInputDto {
  @ApiPropertyOptional({
    description:
      "Existing variant id. Omit to create a new variant when syncing via PUT /products/:id.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id?: number;
}
