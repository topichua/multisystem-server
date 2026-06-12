import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  PermissionCatalogNodeDto,
  PermissionsCatalogResponseDto,
} from "./dto/http/permissions-catalog-response.dto";
import {
  getPermissionCatalogSchema,
  type PermissionCatalogGroupItem,
  type PermissionCatalogIntegrationGrantsItem,
  type PermissionCatalogNode,
} from "./permissions/permissions-catalog";

function toCatalogNodeDto(
  node: PermissionCatalogNode,
): PermissionCatalogNodeDto {
  if (node.type === "group") {
    const group = node as PermissionCatalogGroupItem;
    return {
      type: "group",
      key: group.key,
      label: group.label,
      scope: toCatalogNodeDto(group.scope),
      items: group.items.map(toCatalogNodeDto),
    };
  }
  if (node.type === "integration_grants") {
    const grants = node as PermissionCatalogIntegrationGrantsItem;
    return {
      type: "integration_grants",
      key: grants.key,
      label: grants.label,
      description: grants.description,
      storage: grants.storage,
      manageEndpoint: grants.manageEndpoint,
      items: grants.items.map((field) => ({
        type: field.type,
        key: field.key,
        description: field.description,
        storage: field.storage,
        default: field.default,
        ...(field.options ? { options: field.options } : {}),
        ...(field.integrationTypes
          ? { integrationTypes: [...field.integrationTypes] }
          : {}),
      })),
    };
  }
  if (node.type === "option") {
    return {
      type: "option",
      key: node.key,
      description: node.description,
      storage: node.storage,
      default: node.default,
      options: node.options,
      selectedValue: node.selectedValue,
      selectedOptions: node.selectedOptions,
    };
  }
  return {
    type: "boolean",
    key: node.key,
    description: node.description,
    storage: node.storage,
    default: node.default,
  };
}

@ApiTags("permissions")
@Controller("permissions")
export class PermissionsCatalogController {
  @Get("catalog")
  @ApiOperation({
    summary: "Permission schema for role builder UI",
    description:
      "Returns PERMISSION_MODULES as a versioned schema with storage hints " +
      "(permissions, permissionOptions, integrationGrants).",
  })
  @ApiOkResponse({ type: PermissionsCatalogResponseDto })
  getCatalog(): PermissionsCatalogResponseDto {
    const catalog = getPermissionCatalogSchema();
    return {
      schema: {
        version: catalog.version,
        storage: catalog.storage,
        modules: catalog.modules.map((module) => ({
          module: module.module,
          label: module.label,
          items: module.items.map(toCatalogNodeDto),
        })),
      },
    };
  }
}
