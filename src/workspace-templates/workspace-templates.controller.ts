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
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import {
  CreateWorkspaceTemplateDto,
  UpdateWorkspaceTemplateDto,
} from "./dto/workspace-template-request.dto";
import { WorkspaceTemplateResponseDto } from "./dto/workspace-template-response.dto";
import { WorkspaceTemplatesService } from "./workspace-templates.service";

@ApiTags("workspace — templates")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("workplace/templates")
export class WorkspaceTemplatesController {
  constructor(private readonly templates: WorkspaceTemplatesService) {}

  @Get()
  @ApiOperation({ summary: "List workspace templates" })
  @ApiOkResponse({ type: [WorkspaceTemplateResponseDto] })
  async list(@Req() req: { user?: AuthUser }) {
    return this.templates.listForOwner(this.requireNumericOwnerId(req));
  }

  @Get(":templateId")
  @ApiOperation({ summary: "Get a workspace template by id" })
  @ApiParam({ name: "templateId", type: Number })
  @ApiOkResponse({ type: WorkspaceTemplateResponseDto })
  async getById(
    @Req() req: { user?: AuthUser },
    @Param("templateId", ParseIntPipe) templateId: number,
  ) {
    return this.templates.getForOwner(
      this.requireNumericOwnerId(req),
      templateId,
    );
  }

  @Post()
  @ApiOperation({ summary: "Create a workspace template" })
  @ApiBody({ type: CreateWorkspaceTemplateDto })
  @ApiCreatedResponse({ type: WorkspaceTemplateResponseDto })
  async create(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateWorkspaceTemplateDto,
  ) {
    return this.templates.createForOwner(this.requireNumericOwnerId(req), dto);
  }

  @Patch(":templateId")
  @ApiOperation({ summary: "Update a workspace template" })
  @ApiParam({ name: "templateId", type: Number })
  @ApiBody({ type: UpdateWorkspaceTemplateDto })
  @ApiOkResponse({ type: WorkspaceTemplateResponseDto })
  async update(
    @Req() req: { user?: AuthUser },
    @Param("templateId", ParseIntPipe) templateId: number,
    @Body() dto: UpdateWorkspaceTemplateDto,
  ) {
    return this.templates.updateForOwner(
      this.requireNumericOwnerId(req),
      templateId,
      dto,
    );
  }

  @Delete(":templateId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a workspace template" })
  @ApiParam({ name: "templateId", type: Number })
  @ApiNoContentResponse()
  async delete(
    @Req() req: { user?: AuthUser },
    @Param("templateId", ParseIntPipe) templateId: number,
  ) {
    await this.templates.deleteForOwner(
      this.requireNumericOwnerId(req),
      templateId,
    );
  }

  private requireNumericOwnerId(req: { user?: AuthUser }): number {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return ownerId;
  }
}
