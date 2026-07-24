import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { VariantCustomFieldType } from "../../database/entities/variant-custom-field-type.enum";
import { VariantCustomFieldOptionDto } from "./variant-custom-field-option.dto";

export class VariantCustomFieldDefinitionDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({
    description:
      "Stable key; `color` and `size` map to product_variants columns",
  })
  key!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty({ enum: VariantCustomFieldType })
  type!: VariantCustomFieldType;

  @ApiPropertyOptional({
    type: [VariantCustomFieldOptionDto],
    description: "Predefined options when type is `options` (includes archived)",
  })
  options?: VariantCustomFieldOptionDto[];

  @ApiProperty()
  sortOrder!: number;

  @ApiPropertyOptional({
    nullable: true,
    description: "ISO timestamp when archived; null if active",
  })
  archivedAt!: string | null;
}

export class VariantCustomFieldsListResponseDto {
  @ApiProperty()
  workspaceId!: number;

  @ApiProperty({ type: [VariantCustomFieldDefinitionDto] })
  items!: VariantCustomFieldDefinitionDto[];
}
