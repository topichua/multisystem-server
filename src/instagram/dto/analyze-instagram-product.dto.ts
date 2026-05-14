import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import type { ProductDetailDto } from "../../products/products.service";

export class AnalyzeInstagramProductQueryDto {
  @ApiProperty({
    description:
      "Instagram Graph media id (from GET /api/instagram/media `id` field).",
    example: "17841400008460056_1234567890",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  mediaId: string;
}

export class InstagramAnalyzeProductVariantPreviewDto {
  @ApiProperty({ description: "Color label (empty when not inferred)." })
  color: string;

  @ApiProperty({ description: "Size label (empty when not inferred)." })
  size: string;
}

export class InstagramAnalyzeProductPreviewDto {
  @ApiProperty()
  name: string;

  @ApiProperty({
    description: "Merged short and long description from the model.",
  })
  description: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "First plausible numeric price parsed from the model’s offer/price text (same heuristic as catalog drafts).",
  })
  price: number | null;

  @ApiProperty({
    type: [String],
    description:
      "Instagram post URL when available, plus Graph media URLs for carousel slides / main asset.",
  })
  images: string[];

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Matched workspace category path when the model picked a listed category.",
  })
  matchedCategory: string | null;

  @ApiProperty({ type: () => [InstagramAnalyzeProductVariantPreviewDto] })
  variants: InstagramAnalyzeProductVariantPreviewDto[];

  @ApiProperty({
    description: "Brand or label inferred from image/caption (empty if none).",
  })
  brandOrLabel: string;
}

export class AnalyzeInstagramProductRequestDto {
  @ApiProperty({
    description:
      "Instagram Graph media id (from GET /api/instagram/media `id` field).",
    example: "17841400008460056_1234567890",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  mediaId: string;
}

export class AnalyzedProductDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  shortDescription: string;

  @ApiProperty()
  longDescription: string;

  @ApiProperty({
    type: [String],
    description: 'Кольори товару (наприклад "чорний", "бежевий").',
  })
  colors: string[];

  @ApiProperty({
    type: [String],
    description: 'Розміри (наприклад "S", "M", "42" з підпису або з фото).',
  })
  sizes: string[];

  @ApiProperty({ type: [String] })
  keywords: string[];

  @ApiProperty({ type: Object, additionalProperties: { type: "string" } })
  attributes: Record<string, string>;

  @ApiPropertyOptional({ nullable: true })
  visiblePriceOrOffer: string | null;

  @ApiPropertyOptional({ nullable: true })
  brandOrLabel: string | null;
}

export class AnalyzedCategoryDto {
  @ApiPropertyOptional({
    description:
      "Category id from your workspace when the model picked a listed category; null if none.",
    nullable: true,
  })
  matchedCategoryId: number | null;

  @ApiPropertyOptional({ nullable: true })
  matchedCategoryPath: string | null;

  @ApiProperty()
  reason: string;
}

export class AnalyzeInstagramProductResponseDto {
  @ApiProperty()
  instagramMediaId: string;

  @ApiProperty({ type: () => AnalyzedProductDto })
  product: AnalyzedProductDto;

  @ApiProperty({ type: () => AnalyzedCategoryDto })
  category: AnalyzedCategoryDto;

  @ApiProperty({
    description:
      "Id of the draft catalog row created from this analysis (products + variants + source reference).",
  })
  catalogProductId: number;

  @ApiProperty({
    description:
      "Full catalog product payload (same shape as GET /products/:id), including variants.",
  })
  savedProduct: ProductDetailDto;
}
