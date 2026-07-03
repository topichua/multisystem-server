import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { ConversationGroupsService } from "./conversation-groups.service";
import { ConversationGroupResponseDto } from "./dto/http/conversation-group-response.dto";
import { ConversationGroupsListResponseDto } from "./dto/http/conversation-groups-list-response.dto";
import { CreateConversationGroupRequestDto } from "./dto/http/create-conversation-group-request.dto";
import { UpdateConversationGroupRequestDto } from "./dto/http/update-conversation-group-request.dto";

@ApiTags("conversation-groups")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("conversation-groups")
export class ConversationGroupsController {
  constructor(private readonly groups: ConversationGroupsService) {}

  @Get()
  @ApiOperation({
    summary: "List conversation groups for the current user workspace",
    description:
      "Uses `workspaceId` from the JWT session. With `include_distribution=true`, each group includes " +
      "`conversationCount` (respecting full access or integration grants) and the response includes `totalConversations`.",
  })
  @ApiQuery({
    name: "include_distribution",
    required: false,
    type: Boolean,
    description:
      "When true, attach per-group conversation counts and total accessible conversations for the current user.",
    example: true,
  })
  @ApiOkResponse({ type: ConversationGroupsListResponseDto })
  async list(
    @Req() req: { user?: AuthUser },
    @Query("include_distribution") includeDistributionRaw?: string,
  ): Promise<ConversationGroupsListResponseDto> {
    const userId = Number(req.user?.userId);
    const sessionWorkspaceId = req.user?.workspaceId;
    if (sessionWorkspaceId == null) {
      throw new BadRequestException("workspaceId is required in JWT session");
    }
    const includeDistribution = this.parseOptionalBooleanQuery(
      includeDistributionRaw,
      "include_distribution",
    );
    return this.groups.listForUser(userId, {
      sessionWorkspaceId,
      appRole: req.user?.role,
      includeDistribution,
    });
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one conversation group by id" })
  @ApiOkResponse({ type: ConversationGroupResponseDto })
  async getOne(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
  ): Promise<ConversationGroupResponseDto> {
    const ownerId = Number(req.user?.userId);
    const groupId = this.parsePositiveInt(id, "id");
    return this.groups.getOneForOwner(ownerId, groupId);
  }

  @Post()
  @ApiOperation({ summary: "Create a conversation group" })
  @ApiCreatedResponse({ type: ConversationGroupResponseDto })
  async create(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateConversationGroupRequestDto,
  ): Promise<ConversationGroupResponseDto> {
    const ownerId = Number(req.user?.userId);
    return this.groups.createForOwner(ownerId, dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a conversation group" })
  @ApiOkResponse({ type: ConversationGroupResponseDto })
  async update(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
    @Body() dto: UpdateConversationGroupRequestDto,
  ): Promise<ConversationGroupResponseDto> {
    const ownerId = Number(req.user?.userId);
    const groupId = this.parsePositiveInt(id, "id");
    return this.groups.updateForOwner(ownerId, groupId, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a conversation group",
    description:
      "System groups (new, processing, archived) cannot be deleted. " +
      "Conversations referencing a deleted custom group have `group_id` set to null.",
  })
  @ApiNoContentResponse()
  async remove(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
  ): Promise<void> {
    const ownerId = Number(req.user?.userId);
    const groupId = this.parsePositiveInt(id, "id");
    await this.groups.deleteForOwner(ownerId, groupId);
  }

  private parsePositiveInt(raw: string, field: string): number {
    const t = raw?.trim() ?? "";
    if (!/^\d+$/.test(t)) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    const n = Number(t);
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    return n;
  }

  private parseOptionalBooleanQuery(
    raw: string | undefined,
    paramName: string,
  ): boolean | undefined {
    if (raw == null || raw.trim() === "") {
      return undefined;
    }
    const value = raw.trim().toLowerCase();
    if (value === "true" || value === "1") {
      return true;
    }
    if (value === "false" || value === "0") {
      return false;
    }
    throw new BadRequestException(`${paramName} must be true or false`);
  }
}
