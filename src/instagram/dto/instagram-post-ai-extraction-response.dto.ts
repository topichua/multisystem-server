import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class InstagramPostAiExtractionMediaDto {
  @ApiProperty()
  mediaId: string;

  @ApiProperty()
  url: string;

  @ApiProperty({ enum: ["image", "video"] })
  type: "image" | "video";
}

export class InstagramPostAiExtractionAttributeDto {
  @ApiProperty({ example: "Обʼєм памʼяті" })
  name: string;

  @ApiProperty({ type: [String], example: ["256 ГБ"] })
  values: string[];
}

export class InstagramPostAiExtractionMatchedOptionValueDto {
  @ApiPropertyOptional()
  optionId?: number;

  @ApiProperty()
  optionName: string;
}

export type InstagramPostAiExtractionMatchedFieldValueDto =
  | string
  | InstagramPostAiExtractionMatchedOptionValueDto;

export class InstagramPostAiExtractionMatchedFieldDto {
  @ApiProperty({
    description: "Source attribute name from extraction (same order as attributes).",
    example: "Колір",
  })
  attributeName: string;

  @ApiPropertyOptional({
    description: "Workspace custom field id when matched.",
  })
  id?: number;

  @ApiPropertyOptional({
    description: "Proposed field name when no workspace field matched.",
  })
  name?: string;

  @ApiProperty({ enum: ["option", "text"] })
  type: "option" | "text";

  @ApiProperty({
    description:
      "Text field: string values. Option field: objects with optionName and optional optionId.",
  })
  values: InstagramPostAiExtractionMatchedFieldValueDto[];
}

export class InstagramPostAiExtractionDataDto {
  @ApiProperty()
  productName: string;

  @ApiProperty()
  productDescription: string;

  @ApiPropertyOptional({ nullable: true })
  price: number | null;

  @ApiPropertyOptional({ nullable: true })
  brandLabel: string | null;

  @ApiProperty({
    type: [String],
    description: "Matched workspace category ids (most relevant first, max 5).",
  })
  matchedCategoryIds: string[];

  @ApiProperty({
    type: [String],
    description: "Recommended media ids from this post.",
  })
  selectedMediaIds: string[];

  @ApiProperty({
    type: [InstagramPostAiExtractionAttributeDto],
    description:
      "Generic attributes extracted from the post (not tied to workspace field ids).",
  })
  attributes: InstagramPostAiExtractionAttributeDto[];

  @ApiProperty({
    type: [InstagramPostAiExtractionMatchedFieldDto],
    description:
      "Attributes mapped to workspace custom fields and options where possible.",
  })
  matchedFields: InstagramPostAiExtractionMatchedFieldDto[];
}

export class InstagramPostAiExtractionResponseDto {
  @ApiProperty({ example: "2026-06-05T12:00:00.000Z" })
  generatedAt: string;

  @ApiProperty()
  sourceInstagramPostId: string;

  @ApiProperty({ type: [InstagramPostAiExtractionMediaDto] })
  media: InstagramPostAiExtractionMediaDto[];

  @ApiProperty({ type: InstagramPostAiExtractionDataDto })
  data: InstagramPostAiExtractionDataDto;
}
