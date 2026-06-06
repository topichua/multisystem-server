import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

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

export class MatchedCustomFieldDto {
  @ApiProperty()
  fieldId: string;

  @ApiProperty()

  @ApiProperty({ type: () => [MatchedCustomFieldDto] })
  matchedCustomFields: MatchedCustomFieldDto[];

  @ApiProperty({ type: () => [SuggestedCustomFieldOptionDto] })
  suggestedCustomFieldOptions: SuggestedCustomFieldOptionDto[];

  @ApiProperty({ type: [String] })
  uncertainty: string[];
  fieldName: string;

  @ApiProperty({ enum: ["text", "option"] })
  type: "text" | "option";

  @ApiProperty()
  value: string;

  @ApiPropertyOptional()
  optionId?: string | null;

  @ApiProperty({ enum: ["high", "medium", "low"] })
  confidence: "high" | "medium" | "low";
}

export class SuggestedCustomFieldOptionDto {
  @ApiProperty()
  fieldId: string;

  @ApiProperty()
  fieldName: string;

  @ApiProperty()
  suggestedOptionValue: string;

  @ApiProperty()
  reason: string;
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
      "Graph `media_url` / `thumbnail_url` values only (no post permalink): main asset and each carousel slide when present.",
  })
  images: string[];

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Matched workspace category path when the model picked a listed category.",
  })
  matchedCategory: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Workspace `product_categories.id` when the model matched a category from your catalog; null if unmatched or invalid id.",
  })
  categoryId: number | null;

  @ApiProperty({ type: () => [InstagramAnalyzeProductVariantPreviewDto] })
  variants: InstagramAnalyzeProductVariantPreviewDto[];

  @ApiProperty({
    description: "Brand or label inferred from image/caption (empty if none).",
  })
  brandOrLabel: string;

  @ApiProperty({ type: () => [MatchedCustomFieldDto] })
  matchedCustomFields: MatchedCustomFieldDto[];

  @ApiProperty({ type: () => [SuggestedCustomFieldOptionDto] })
  suggestedCustomFieldOptions: SuggestedCustomFieldOptionDto[];

  @ApiProperty({ type: [String] })
  uncertainty: string[];
}

/** Internal OpenAI JSON shape for legacy media preview analysis. */
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
