import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ConversationsService } from './conversations.service';
import { ConversationsListResponseDto } from './dto/http/conversations-list-response.dto';
import { SyncConversationsResponseDto } from './dto/http/sync-conversations-response.dto';
import { InstagramMessagesResponseDto } from './dto/http/instagram-messages-response.dto';
import { SendInstagramMessageRequestDto } from './dto/http/send-instagram-message-request.dto';
import { SendInstagramMessageResponseDto } from './dto/http/send-instagram-message-response.dto';

@ApiTags('admin — conversations')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({
    summary: 'List conversations stored for the current owner (see POST …/sync)',
  })
  @ApiOkResponse({ type: ConversationsListResponseDto })
  async getMine(
    @Req() req: { user?: AuthUser },
  ): Promise<ConversationsListResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        'Current authorized user does not contain numeric owner id',
      );
    }
    return this.conversationsService.listConversationsForOwner(ownerId);
  }

  @Post('sync')
  @ApiOperation({
    summary: 'Sync Instagram conversations from Graph API into the database',
  })
  @ApiOkResponse({ type: SyncConversationsResponseDto })
  async sync(
    @Req() req: { user?: AuthUser },
  ): Promise<SyncConversationsResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        'Current authorized user does not contain numeric owner id',
      );
    }
    return this.conversationsService.syncInstagramConversationsForOwner(ownerId);
  }

  @Get(':conversationId/messages')
  @ApiOperation({
    summary: 'Get Instagram messages by conversation id',
  })
  @ApiOkResponse({ type: InstagramMessagesResponseDto })
  async getMessagesByConversationId(
    @Req() req: { user?: AuthUser },
    @Param('conversationId') conversationId: string,
  ): Promise<InstagramMessagesResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        'Current authorized user does not contain numeric owner id',
      );
    }
    return this.conversationsService.getInstagramMessagesForConversation(
      ownerId,
      conversationId,
    );
  }

  @Post(':conversationId/messages')
  @ApiOperation({
    summary: 'Send Instagram message to conversation',
  })
  @ApiOkResponse({ type: SendInstagramMessageResponseDto })
  async sendMessageByConversationId(
    @Req() req: { user?: AuthUser },
    @Param('conversationId') conversationId: string,
    @Body() dto: SendInstagramMessageRequestDto,
  ): Promise<SendInstagramMessageResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        'Current authorized user does not contain numeric owner id',
      );
    }
    return this.conversationsService.sendInstagramMessageForConversation(
      ownerId,
      dto.recipientId,
      dto.message,
    );
  }
}
