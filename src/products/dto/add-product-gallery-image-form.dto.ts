import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

/** Optional multipart fields for `POST /products/:id/media` (image file is required). */
export class AddProductGalleryImageFormDto {
  @ApiPropertyOptional({
    description:
      "Gallery order for product-level media. If omitted, appends after the highest existing sort order.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
