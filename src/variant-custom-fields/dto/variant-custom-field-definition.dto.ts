import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { VariantCustomFieldType } from "../../database/entities/variant-custom-field-type.enum";

export class VariantCustomFieldDefinitionDto {
  @ApiProperty()
  id: number;

  @ApiProperty({
    description: "Stable key; `color` and `size` map to product_variants columns",
  })
  key: string;

  @ApiProperty()
  label: string;

  @ApiProperty({ enum: VariantCustomFieldType })
  type: VariantCustomFieldType;

  @ApiPropertyOptional({
    type: [String],
    description: "Predefined values when type is `options`",
  })
  options?: string[];

  @ApiProperty()
  sortOrder: number;
}

export class VariantCustomFieldsListResponseDto {
  @ApiProperty()
  workspaceId: number;

  @ApiProperty({ type: [VariantCustomFieldDefinitionDto] })
  items: VariantCustomFieldDefinitionDto[];
}
