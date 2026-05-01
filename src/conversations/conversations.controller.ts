import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ConversationsService } from './conversations.service';
import {
  ConversationRowDto,
  ConversationsListResponseDto,
} from './dto/http/conversations-list-response.dto';
import { SyncConversationsResponseDto } from './dto/http/sync-conversations-response.dto';
import { InstagramMessagesResponseDto } from './dto/http/instagram-messages-response.dto';
import { AssignConversationGroupRequestDto } from './dto/http/assign-conversation-group-request.dto';
import { SendInstagramMessageRequestDto } from './dto/http/send-instagram-message-request.dto';
import { SendInstagramMessageResponseDto } from './dto/http/send-instagram-message-response.dto';

@ApiTags("admin — conversations")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller("conversations")
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({
    summary: "List conversations for the current owner",
    description:
      "Optional `groupIds`: comma-separated positive integers (e.g. `1,2,3`). Only conversations whose `group_id` is in that set are returned. Every id must exist in the owner’s workspace.",
  })
  @ApiQuery({
    name: "groupIds",
    required: false,
    description:
      "Comma-separated conversation group ids, e.g. `1,2`. Omit for all conversations.",
    example: "1,2",
  })
  @ApiOkResponse({ type: ConversationsListResponseDto })
  async getAll(
    @Req() req: { user?: AuthUser },
    @Query("groupIds") groupIdsRaw?: string | string[],
  ): Promise<ConversationsListResponseDto> {
    const ownerId = Number(req.user?.userId);
    const groupIds = this.parseOptionalGroupIdsQuery(groupIdsRaw);
    return this.conversationsService.listConversationsForOwner(ownerId, {
      groupIds,
    });
  }

  /**
   * Accepts `?groupIds=1,2` or repeated `groupIds` (framework-dependent).
   * Empty / absent → undefined (no filter).
   */
  private parseOptionalGroupIdsQuery(
    raw?: string | string[],
  ): number[] | undefined {
    if (raw == null) return undefined;
    const chunks = Array.isArray(raw) ? raw : [raw];
    const ids: number[] = [];
    for (const chunk of chunks) {
      for (const part of chunk.split(",")) {
        const t = part.trim();
        if (!t) continue;
        if (!/^\d+$/.test(t)) {
          throw new BadRequestException(
            `groupIds must be comma-separated positive integers; invalid segment: "${part.trim()}"`,
          );
        }
        const n = Number(t);
        if (!Number.isInteger(n) || n <= 0) {
          throw new BadRequestException(
            `groupIds must be comma-separated positive integers; invalid segment: "${part.trim()}"`,
          );
        }
        ids.push(n);
      }
    }
    return ids.length > 0 ? [...new Set(ids)] : undefined;
  }

  @Post("sync")
  @ApiOperation({
    summary: "Sync Instagram conversations from Graph API into the database",
  })
  @ApiOkResponse({ type: SyncConversationsResponseDto })
  async sync(
    @Req() req: { user?: AuthUser }
  ): Promise<SyncConversationsResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id"
      );
    }
    return this.conversationsService.syncInstagramConversationsForOwner(
      ownerId
    );
  }

  @Get(":conversationId/messages")
  @ApiOperation({
    summary:
      "Get messages for a conversation from local database with paging.",
  })
  @ApiQuery({
    name: "page",
    required: false,
    description: "Paging: 1-based page number. Default: 1.",
    schema: { type: "string", example: "1" },
  })
  @ApiQuery({
    name: "pageSize",
    required: false,
    description: "Paging: messages per page. Default: 50, max: 200.",
    schema: { type: "string", example: "50" },
  })
  @ApiOkResponse({ type: InstagramMessagesResponseDto })
  async getMessagesByConversationId(
    @Req() req: { user?: AuthUser },
    @Param("conversationId") conversationId: string,
    @Query("page") pageRaw?: string,
    @Query("pageSize") pageSizeRaw?: string
  ): Promise<InstagramMessagesResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id"
      );
    }
    const { page, pageSize } =
      this.conversationsService.parseDbPagingForMessages(pageRaw, pageSizeRaw);
    return this.conversationsService.getInstagramMessagesForConversation(
      ownerId,
      conversationId,
      {
        page,
        pageSize,
      }
    );
  }

  @Post(":conversationId/messages")
  @ApiOperation({
    summary:
      "Send Instagram message in this thread. `reply_to_id` is optional: omit or null for a normal message; set it to the parent message id to send a reply. Recipient PSID comes from `participant_id` on the conversation row.",
  })
  @ApiBody({
    type: SendInstagramMessageRequestDto,
  })
  @ApiOkResponse({ type: SendInstagramMessageResponseDto })
  async sendMessageByConversationId(
    @Req() req: { user?: AuthUser },
    @Param("conversationId") conversationId: string,
    @Body() dto: SendInstagramMessageRequestDto
  ): Promise<SendInstagramMessageResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id"
      );
    }
    return this.conversationsService.sendInstagramMessageForConversation(
      ownerId,
      conversationId,
      dto.message,
      dto.reply_to_id,
    );
  }

  @Put(":id")
  @ApiOperation({
    summary: "Assign a conversation group",
    description:
      "Sets `group_id` on the conversation to `groupId`. The group must belong to the same workspace as the owner’s integration.",
  })
  @ApiBody({ type: AssignConversationGroupRequestDto })
  @ApiOkResponse({ type: ConversationRowDto })
  async assignGroup(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
    @Body() dto: AssignConversationGroupRequestDto,
  ): Promise<ConversationRowDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    const numericId = Number(id);
    if (
      !Number.isInteger(numericId) ||
      numericId <= 0 ||
      !/^\d+$/.test(id.trim())
    ) {
      throw new BadRequestException("id must be a positive integer");
    }
    return this.conversationsService.assignConversationGroupForOwner(
      ownerId,
      numericId,
      dto.groupId,
    );
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get one conversation by database id (primary key)",
  })
  @ApiOkResponse({ type: ConversationRowDto })
  async getById(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string
  ): Promise<ConversationRowDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id"
      );
    }
    const numericId = Number(id);
    if (
      !Number.isInteger(numericId) ||
      numericId <= 0 ||
      !/^\d+$/.test(id.trim())
    ) {
      throw new BadRequestException("id must be a positive integer");
    }
    return this.conversationsService.getConversationForOwnerById(
      ownerId,
      numericId
    );
  }
}
