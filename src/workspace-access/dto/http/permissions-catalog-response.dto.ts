import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class PermissionOptionItemDto {
  @ApiProperty({ example: "all" })
  value: string;

  @ApiProperty({ example: "All" })
  label: string;
}

export class PermissionCatalogNodeDto {
  @ApiProperty({
    enum: ["boolean", "option", "group", "integration_grants"],
  })
  type: "boolean" | "option" | "group" | "integration_grants";

  @ApiProperty({ example: "orders.read" })
  key: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional({ example: "Visibility" })
  label?: string;

  @ApiPropertyOptional({
    enum: ["permissions", "permissionOptions", "integrationGrants"],
    description: "Where this field is persisted when saving a role.",
  })
  storage?: "permissions" | "permissionOptions" | "integrationGrants";

  @ApiPropertyOptional({
    description: "Default when unset (boolean: false, option: catalog default).",
  })
  default?: string | boolean;

  @ApiPropertyOptional({ type: [PermissionOptionItemDto] })
  options?: PermissionOptionItemDto[];

  @ApiPropertyOptional({
    example: "selected",
    description: "When the scope option equals this value, use permissionOptionLists.",
  })
  selectedValue?: string;

  @ApiPropertyOptional({
    type: [PermissionOptionItemDto],
    description: "Selectable list values when selectedValue is active.",
  })
  selectedOptions?: PermissionOptionItemDto[];

  @ApiPropertyOptional({
    type: () => PermissionCatalogNodeDto,
    description: "Scope option for type `group`.",
  })
  scope?: PermissionCatalogNodeDto;

  @ApiPropertyOptional({
    type: () => [PermissionCatalogNodeDto],
    description: "Nested permissions inside a group or integration_grants.",
  })
  items?: PermissionCatalogNodeDto[];

  @ApiPropertyOptional({
    example: "/workspace/roles/:roleId/integration-grants",
    description: "API endpoint for type `integration_grants`.",
  })
  manageEndpoint?: string;
}

export class PermissionModuleDto {
  @ApiProperty({ example: "orders" })
  module: string;

  @ApiProperty({ example: "Order" })
  label: string;

  @ApiProperty({ type: [PermissionCatalogNodeDto] })
  items: PermissionCatalogNodeDto[];
}

export class PermissionCatalogStorageFieldDto {
  @ApiProperty()
  type: string;

  @ApiProperty()
  description: string;

  @ApiPropertyOptional()
  endpoint?: string;
}

export class PermissionCatalogStorageDto {
  @ApiProperty({ type: PermissionCatalogStorageFieldDto })
  permissions: PermissionCatalogStorageFieldDto;

  @ApiProperty({ type: PermissionCatalogStorageFieldDto })
  permissionOptions: PermissionCatalogStorageFieldDto;

  @ApiProperty({ type: PermissionCatalogStorageFieldDto })
  integrationGrants: PermissionCatalogStorageFieldDto;
}

export class PermissionCatalogSchemaDto {
  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ type: [PermissionModuleDto] })
  modules: PermissionModuleDto[];

  @ApiProperty({ type: PermissionCatalogStorageDto })
  storage: PermissionCatalogStorageDto;
}

export class PermissionsCatalogResponseDto {
  @ApiProperty({
    type: PermissionCatalogSchemaDto,
    description: "Full permission schema derived from PERMISSION_MODULES.",
  })
  schema: PermissionCatalogSchemaDto;
}
