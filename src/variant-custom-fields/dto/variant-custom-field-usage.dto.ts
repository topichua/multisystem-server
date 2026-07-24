import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { VariantCustomFieldType } from "../../database/entities/variant-custom-field-type.enum";

export class VariantCustomFieldOptionUsageDto {
  @ApiProperty()
  optionId: number;

  @ApiProperty()
  label: string;

  @ApiPropertyOptional({
    nullable: true,
    description: "ISO timestamp when archived; null if active",
  })
  archivedAt!: string | null;

  @ApiProperty()
  productCount: number;

  @ApiProperty({ description: "Number of variant usages for this option." })
  productVariantCount: number;
}

export class VariantCustomFieldTextUsageDto {
  @ApiProperty()
  value: string;

  @ApiProperty({ description: "Number of distinct products using this value." })
  productCount: number;

  @ApiProperty({ description: "Number of variant usages for this value." })
  productVariantCount: number;
}

export class VariantCustomFieldUsageDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  key: string;

  @ApiProperty()
  label: string;

  @ApiProperty({ enum: VariantCustomFieldType })
  type: VariantCustomFieldType;

  @ApiPropertyOptional({
    nullable: true,
    description: "ISO timestamp when archived; null if active",
  })
  archivedAt!: string | null;

  @ApiProperty({ description: "Number of distinct products using this field." })
  totalProducts: number;

  @ApiProperty({ type: [VariantCustomFieldOptionUsageDto], required: false })
  options?: VariantCustomFieldOptionUsageDto[];

  @ApiProperty({ type: [VariantCustomFieldTextUsageDto], required: false })
  topTextValues?: VariantCustomFieldTextUsageDto[];
}
