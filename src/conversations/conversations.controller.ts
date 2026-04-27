import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { SendInstagramMessageRequestDto } from './dto/http/send-instagram-message-request.dto';
import { SendInstagramMessageResponseDto } from './dto/http/send-instagram-message-response.dto';

@ApiTags("admin — conversations")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller("conversations")
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({})
  @ApiOkResponse({ type: ConversationsListResponseDto })
  async getAll(
    @Req() req: { user?: AuthUser }
  ): Promise<ConversationsListResponseDto> {
    const ownerId = Number(req.user?.userId);
    return this.conversationsService.listConversationsForOwner(ownerId);
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
      "Get messages for a conversation. `conversationId` = DB id or Instagram external id. `sync=true` (default): fetch Instagram Graph, upsert into `conversation_messages`, return API payload. `sync=false`: read `conversation_messages` only (no Graph). Optional `since` filters by time (Graph when sync=true, DB `created_at` when sync=false).",
  })
  @ApiQuery({
    name: "since",
    required: false,
    description:
      "Only messages at or after this time: ISO 8601, or Unix seconds (10 digits) / milliseconds (13 digits).",
    example: "2024-06-01T00:00:00.000Z",
  })
  @ApiQuery({
    name: "sync",
    required: false,
    description:
      "true (default): Instagram API + save rows. false: database only.",
    schema: { type: "string", enum: ["true", "false"] },
  })
  @ApiOkResponse({ type: InstagramMessagesResponseDto })
  async getMessagesByConversationId(
    @Req() req: { user?: AuthUser },
    @Param("conversationId") conversationId: string,
    @Query("since") sinceRaw?: string,
    @Query("sync") syncRaw?: string
  ): Promise<InstagramMessagesResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id"
      );
    }
    const since =
      this.conversationsService.parseOptionalSinceForMessages(sinceRaw);
    const sync = this.conversationsService.parseSyncForMessages(syncRaw);
    return this.conversationsService.getInstagramMessagesForConversation(
      ownerId,
      conversationId,
      {
        ...(since != null ? { since } : {}),
        sync,
      }
    );
  }

  @Post(":conversationId/messages")
  @ApiOperation({
    summary:
      "Send Instagram message in this thread. Body `recipientId` is optional — defaults to the conversation’s stored `participant_id` (numeric PSID).",
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
      dto.recipientId
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
