import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { VariantCustomFieldType } from "../../database/entities/variant-custom-field-type.enum";
import { VariantCustomFieldDefinitionDto } from "./variant-custom-field-definition.dto";

export class SystemFieldLibraryFieldDto {
  @ApiProperty({ example: "color" })
  key: string;

  @ApiProperty({ example: "Колір" })
  label: string;

  @ApiProperty({
    description: "UI label with type, e.g. «Колір (список)».",
    example: "Колір (список)",
  })
  displayLabel: string;

  @ApiProperty({ enum: VariantCustomFieldType })
  type: VariantCustomFieldType;

  @ApiProperty({
    description: "`список` for options, `текст` for text.",
    example: "список",
  })
  typeLabel: string;

  @ApiProperty({ type: [String], example: ["Чорний", "Білий"] })
  options: string[];

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({
    description:
      "True when this workspace already has a field with the same key (UI «є»).",
  })
  alreadyInstalled: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description: "Workspace field id when alreadyInstalled.",
  })
  workspaceFieldId: number | null;
}

export class SystemFieldLibraryGroupDto {
  @ApiProperty({ example: "shoes" })
  key: string;

  @ApiProperty({ example: "Взуття" })
  label: string;

  @ApiProperty({
    description: "Icon id for the frontend (clothing, shoes, bags, …).",
    example: "shoes",
  })
  icon: string;

  @ApiProperty({
    description: "Number of fields in this category (accordion badge).",
    example: 3,
  })
  fieldCount: number;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty({ type: [SystemFieldLibraryFieldDto] })
  fields: SystemFieldLibraryFieldDto[];
}

export class SystemFieldLibraryListResponseDto {
  @ApiProperty()
  workspaceId: number;

  @ApiProperty({
    type: [SystemFieldLibraryFieldDto],
    description:
      "Top-level templates above category accordion (e.g. Колір) — matches UI «ДОДАТИ ПОЛЕ З ШАБЛОНУ».",
  })
  featured: SystemFieldLibraryFieldDto[];

  @ApiProperty({ type: [SystemFieldLibraryGroupDto] })
  groups: SystemFieldLibraryGroupDto[];
}

export class InstallSystemFieldLibraryRequestDto {
  @ApiProperty({
    example: "shoe_size",
    description: "System library field key to install into this workspace.",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9_]{0,63}$/, {
    message: "key must be lowercase snake_case (e.g. color)",
  })
  key: string;

  @ApiPropertyOptional({
    example: "shoes",
    description:
      "Category the user installed from (Одяг / Взуття / …). " +
      "Sets system `label` to `{group}: {displayName}` (e.g. `Взуття: розмір`) " +
      "while `displayName` stays short (`Розмір`). Omit for featured installs.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9_]{0,63}$/)
  groupKey?: string;
}

export class InstallSystemFieldLibraryResponseDto {
  @ApiProperty({ type: VariantCustomFieldDefinitionDto })
  field: VariantCustomFieldDefinitionDto;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Primary category key when the field belongs to a group; null for featured-only keys.",
    example: "shoes",
  })
  groupKey: string | null;
}
