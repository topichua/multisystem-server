import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PermissionsCatalogResponseDto } from "./dto/http/permissions-catalog-response.dto";
import { PERMISSION_MODULES } from "./permissions/permissions-catalog";

@ApiTags("permissions")
@Controller("permissions")
export class PermissionsCatalogController {
  @Get("catalog")
  @ApiOperation({
    summary: "Static permission catalog (modules and keys for role builder)",
  })
  @ApiOkResponse({ type: PermissionsCatalogResponseDto })
  getCatalog(): PermissionsCatalogResponseDto {
    return { modules: PERMISSION_MODULES };
  }
}
