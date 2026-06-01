import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import {
  CreateVariantCustomFieldDto,
  UpdateVariantCustomFieldDto,
} from "./dto/variant-custom-field-request.dto";
import {
  VariantCustomFieldDefinitionDto,
  VariantCustomFieldsListResponseDto,
} from "./dto/variant-custom-field-definition.dto";
import { VariantCustomFieldsService } from "./variant-custom-fields.service";

@ApiTags("workspace")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("workspace/variant-custom-fields")
export class VariantCustomFieldsController {
  constructor(private readonly fields: VariantCustomFieldsService) {}

  @Get()
  @ApiOperation({
    summary: "List variant custom field definitions for the workspace",
    description:
      "Returns workspace-configured variant attributes (e.g. Color, Size). " +
      "Defaults are created automatically when none exist. " +
      "Product variants use customFields: [{ field: { id? | name?, type? }, value }].",
  })
  @ApiOkResponse({ type: VariantCustomFieldsListResponseDto })
  list(
    @Req() req: { user?: AuthUser },
  ): Promise<VariantCustomFieldsListResponseDto> {
    return this.fields.listForOwner(this.requireOwnerId(req));
  }

  @Post()
  @ApiCreatedResponse({ type: VariantCustomFieldDefinitionDto })
  create(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateVariantCustomFieldDto,
  ): Promise<VariantCustomFieldDefinitionDto> {
    return this.fields.createForOwner(this.requireOwnerId(req), dto);
  }

  @Patch(":id")
  @ApiOkResponse({ type: VariantCustomFieldDefinitionDto })
  update(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateVariantCustomFieldDto,
  ): Promise<VariantCustomFieldDefinitionDto> {
    return this.fields.updateForOwner(this.requireOwnerId(req), id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiOperation({
    summary: "Delete a custom field definition",
    description:
      "Removes the definition only; existing variant column values are kept.",
  })
  delete(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<void> {
    return this.fields.deleteForOwner(this.requireOwnerId(req), id);
  }

  private requireOwnerId(req: { user?: AuthUser }): number {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return ownerId;
  }
}
