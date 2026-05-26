import { ApiProperty } from "@nestjs/swagger";

export class PermissionItemDto {
  @ApiProperty({ example: "conversations.read" })
  key: string;

  @ApiProperty()
  description: string;
}

export class PermissionModuleDto {
  @ApiProperty({ example: "conversations" })
  module: string;

  @ApiProperty({ example: "Conversations" })
  label: string;

  @ApiProperty({ type: [PermissionItemDto] })
  permissions: PermissionItemDto[];
}

export class PermissionsCatalogResponseDto {
  @ApiProperty({ type: [PermissionModuleDto] })
  modules: PermissionModuleDto[];
}
