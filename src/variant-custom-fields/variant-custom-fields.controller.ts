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
  Put,
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
  VariantCustomFieldOptionDto,
  VariantCustomFieldOptionRequestDto,
} from "./dto/variant-custom-field-option.dto";
import {
  VariantCustomFieldDefinitionDto,
  VariantCustomFieldsListResponseDto,
} from "./dto/variant-custom-field-definition.dto";
import { VariantCustomFieldUsageDto } from "./dto/variant-custom-field-usage.dto";
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
      "Returns workspace-configured variant attributes (e.g. Color, Size), including archived. " +
      "Defaults are created automatically when none exist. " +
      "Options are returned as `{ id, label, archivedAt }` objects. " +
      "Product variants use customFields: [{ field: { id? | name?, type? }, value }].",
  })
  @ApiOkResponse({ type: VariantCustomFieldsListResponseDto })
  list(
    @Req() req: { user?: AuthUser },
  ): Promise<VariantCustomFieldsListResponseDto> {
    return this.fields.listForOwner(this.requireOwnerId(req));
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get custom field usage statistics",
    description:
      "Returns usage statistics for a workspace variant custom field. " +
      "Option fields return all options and how many products use each option. " +
      "Text fields return top 10 text values by usage count plus the total number of products using the field.",
  })
  @ApiOkResponse({ type: VariantCustomFieldUsageDto })
  usage(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<VariantCustomFieldUsageDto> {
    return this.fields.getUsageForOwner(this.requireOwnerId(req), id);
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
    summary: "Hard-delete a custom field definition",
    description:
      "Allowed only when the field has no variant usages. " +
      "If it is in use, archive it instead via POST /:id/archive.",
  })
  delete(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<void> {
    return this.fields.deleteForOwner(this.requireOwnerId(req), id);
  }

  @Post(":id/archive")
  @ApiOkResponse({ type: VariantCustomFieldDefinitionDto })
  @ApiOperation({
    summary: "Archive a custom field",
    description:
      "Archives the field and all of its list options. Archived fields/options are hidden from active catalogs.",
  })
  archive(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<VariantCustomFieldDefinitionDto> {
    return this.fields.archiveForOwner(this.requireOwnerId(req), id);
  }

  @Post(":id/unarchive")
  @ApiOkResponse({ type: VariantCustomFieldDefinitionDto })
  @ApiOperation({
    summary: "Unarchive a custom field",
    description:
      "Restores the field. Options stay archived until unarchived individually.",
  })
  unarchive(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<VariantCustomFieldDefinitionDto> {
    return this.fields.unarchiveForOwner(this.requireOwnerId(req), id);
  }

  @Post(":id/option")
  @ApiCreatedResponse({ type: VariantCustomFieldOptionDto })
  createOption(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: VariantCustomFieldOptionRequestDto,
  ): Promise<VariantCustomFieldOptionDto> {
    return this.fields
      .addOptionForOwner(this.requireOwnerId(req), id, dto.label)
      .then((r) => ({
        id: r.id,
        label: r.label,
        archivedAt: r.archivedAt?.toISOString() ?? null,
      }));
  }

  @Put(":id/option/:optionId")
  @ApiOkResponse({ type: VariantCustomFieldOptionDto })
  updateOption(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Param("optionId", ParseIntPipe) optionId: number,
    @Body() dto: VariantCustomFieldOptionRequestDto,
  ): Promise<VariantCustomFieldOptionDto> {
    return this.fields
      .updateOptionForOwner(this.requireOwnerId(req), id, optionId, dto.label)
      .then((r) => ({
        id: r.id,
        label: r.label,
        archivedAt: r.archivedAt?.toISOString() ?? null,
      }));
  }

  @Post(":id/option/:optionId/archive")
  @ApiOkResponse({ type: VariantCustomFieldOptionDto })
  @ApiOperation({ summary: "Archive a list option" })
  archiveOption(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Param("optionId", ParseIntPipe) optionId: number,
  ): Promise<VariantCustomFieldOptionDto> {
    return this.fields.archiveOptionForOwner(
      this.requireOwnerId(req),
      id,
      optionId,
    );
  }

  @Post(":id/option/:optionId/unarchive")
  @ApiOkResponse({ type: VariantCustomFieldOptionDto })
  @ApiOperation({
    summary: "Unarchive a list option",
    description: "Fails if the parent field is still archived.",
  })
  unarchiveOption(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Param("optionId", ParseIntPipe) optionId: number,
  ): Promise<VariantCustomFieldOptionDto> {
    return this.fields.unarchiveOptionForOwner(
      this.requireOwnerId(req),
      id,
      optionId,
    );
  }

  @Delete(":id/option/:optionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiOperation({
    summary: "Hard-delete a list option",
    description:
      "Allowed only when unused. If in use, archive via POST /:id/option/:optionId/archive.",
  })
  deleteOption(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
    @Param("optionId", ParseIntPipe) optionId: number,
  ): Promise<void> {
    return this.fields.deleteOptionForOwner(
      this.requireOwnerId(req),
      id,
      optionId,
    );
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
