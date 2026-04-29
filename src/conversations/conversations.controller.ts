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
      "Send Instagram message in this thread. Body is only `{ message }`. Recipient PSID comes from the conversation row (`participant_id`).",
  })
  @ApiBody({
    type: SendInstagramMessageRequestDto,
    description: "Must contain only the `message` field (no recipientId or other keys).",
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
      dto.message
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
