import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { VariantCustomFieldType } from "../../database/entities/variant-custom-field-type.enum";
import { VariantCustomFieldOptionDto } from "./variant-custom-field-option.dto";

export class VariantCustomFieldUserDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  firstName!: string;

  @ApiPropertyOptional({ nullable: true })
  lastName!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Avatar CDN URL when set.",
  })
  avatar!: string | null;
}

export class VariantCustomFieldDefinitionDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({
    description:
      "Stable key; `color` and `size` map to product_variants columns",
  })
  key!: string;

  @ApiProperty({
    description:
      "System / full name (`{group.label}:{field.name}`, e.g. `Взуття:Розмір`). Prefer `displayName` in UI.",
  })
  label!: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Optional short UI name (`field.name`, e.g. `Розмір` when `label` is `Взуття:Розмір`). " +
      "Omit or null → clients should show `label`.",
    example: "Розмір",
  })
  displayName!: string | null;

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

  @ApiPropertyOptional({
    description: "When the field definition was created (ISO).",
  })
  createdAt?: string;

  @ApiPropertyOptional({
    description: "When the field definition was last updated (ISO).",
  })
  updatedAt?: string;

  @ApiPropertyOptional({
    type: VariantCustomFieldUserDto,
    nullable: true,
    description: "User who created this field definition.",
  })
  createdBy!: VariantCustomFieldUserDto | null;

  @ApiPropertyOptional({
    type: VariantCustomFieldUserDto,
    nullable: true,
    description: "User who last edited this field definition.",
  })
  updatedBy!: VariantCustomFieldUserDto | null;
}

export class VariantCustomFieldsListResponseDto {
  @ApiProperty()
  workspaceId!: number;

  @ApiProperty({ type: [VariantCustomFieldDefinitionDto] })
  items!: VariantCustomFieldDefinitionDto[];
}
