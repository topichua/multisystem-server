import {
  Body,
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SuperAdminGuard } from "../auth/super-admin.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { ConversationsService } from "./conversations.service";
import {
  ConversationRowDto,
  ConversationsListResponseDto,
} from "./dto/http/conversations-list-response.dto";
import { SyncConversationsResponseDto } from "./dto/http/sync-conversations-response.dto";
import { InstagramMessagesResponseDto } from "./dto/http/instagram-messages-response.dto";
import { UpdateConversationRequestDto } from "./dto/http/update-conversation-request.dto";
import { ConversationProductSuggestionsResponseDto } from "./dto/http/conversation-product-suggestions-response.dto";
import { ProductSuggestionItemDto } from "./dto/http/conversation-product-suggestions-response.dto";
import { CreateProductSuggestionRequestDto } from "./dto/http/create-product-suggestion-request.dto";
import { SendInstagramMessageRequestDto } from "./dto/http/send-instagram-message-request.dto";
import { SendInstagramMessageResponseDto } from "./dto/http/send-instagram-message-response.dto";
import { InstagramGraphMessagesResponseDto } from "./dto/http/instagram-graph-messages-response.dto";
import { ListInstagramGraphMessagesQueryDto } from "./dto/http/list-instagram-graph-messages-query.dto";

@ApiTags("admin — conversations")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller("conversations")
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({
    summary: "List conversations for a workspace",
    description:
      "Returns conversations scoped by `workspace_id` (query param, else JWT session `workspaceId`, else your latest integration workspace). " +
      "Optional `groupIds`: comma-separated positive integers (e.g. `1,2,3`). Only conversations whose `group_id` is in that set are returned. Every id must exist in the workspace.",
  })
  @ApiQuery({
    name: "workspace_id",
    required: false,
    description:
      "Workspace to list conversations for. When omitted, uses `workspaceId` from the JWT session.",
    schema: { type: "integer", minimum: 1 },
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
    @Query("workspace_id") workspaceIdRaw?: string,
    @Query("groupIds") groupIdsRaw?: string | string[],
  ): Promise<ConversationsListResponseDto> {
    const ownerId = Number(req.user?.userId);
    const groupIds = this.parseOptionalGroupIdsQuery(groupIdsRaw);
    return this.conversationsService.listConversationsForOwner(ownerId, {
      workspaceId: this.parseOptionalWorkspaceId(workspaceIdRaw),
      sessionWorkspaceId: req.user?.workspaceId,
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

  private parseOptionalWorkspaceId(raw?: string): number | undefined {
    if (raw == null || raw.trim() === "") {
      return undefined;
    }
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new BadRequestException("workspace_id must be a positive integer");
    }
    const workspaceId = Number(trimmed);
    if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
      throw new BadRequestException("workspace_id must be a positive integer");
    }
    return workspaceId;
  }

  @Post("sync")
  @ApiOperation({
    summary: "Sync Instagram conversations from Graph API into the database",
  })
  @ApiOkResponse({ type: SyncConversationsResponseDto })
  async sync(
    @Req() req: { user?: AuthUser },
  ): Promise<SyncConversationsResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return this.conversationsService.syncInstagramConversationsForOwner(
      ownerId,
    );
  }

  @Post("suggestions")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create a product suggestion for a conversation",
    description:
      "Stores a row in product_suggestions linking conversation, product, optional variant, and optional Instagram post id.",
  })
  @ApiBody({ type: CreateProductSuggestionRequestDto })
  @ApiCreatedResponse({ type: ProductSuggestionItemDto })
  async createProductSuggestion(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateProductSuggestionRequestDto,
  ): Promise<ProductSuggestionItemDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return this.conversationsService.createProductSuggestionForOwner(
      ownerId,
      dto,
    );
  }

  @Get(":conversationId/messages")
  @ApiOperation({
    summary: "Get messages for a conversation from local database with paging.",
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
    @Query("pageSize") pageSizeRaw?: string,
  ): Promise<InstagramMessagesResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
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
      },
    );
  }

  @Get(":conversationId/graph-messages")
  @ApiOperation({
    summary: "Get Instagram messages live from Meta Graph API",
    description:
      "Calls Meta Graph `GET /{conversation-id}/messages` with " +
      "`fields=id,created_time,from,to,message,attachments,shares`. " +
      "Uses the stored Instagram Graph conversation id (`conversations.external_id`). " +
      "Pass Graph cursors `after` / `before` from `paging.cursors` to paginate.",
  })
  @ApiOkResponse({ type: InstagramGraphMessagesResponseDto })
  async getGraphMessagesByConversationId(
    @Req() req: { user?: AuthUser },
    @Param("conversationId") conversationId: string,
    @Query() query: ListInstagramGraphMessagesQueryDto,
  ): Promise<InstagramGraphMessagesResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return this.conversationsService.getInstagramGraphMessagesForConversation(
      ownerId,
      conversationId,
      query,
    );
  }

  @Post(":conversationId/messages")
  @ApiOperation({
    summary:
      "Send a message in this thread (Instagram or Telegram). `reply_to_id` is optional: omit for a normal message; set to a parent message id from GET .../messages (Instagram Graph `mid` or Telegram `tg:{chatId}:{messageId}`). " +
      "Instagram: within 24h of the last customer message uses `RESPONSE`; within 7 days uses `MESSAGE_TAG` + `HUMAN_AGENT`; after 7 days returns 400.",
  })
  @ApiBody({
    type: SendInstagramMessageRequestDto,
  })
  @ApiOkResponse({ type: SendInstagramMessageResponseDto })
  async sendMessageByConversationId(
    @Req() req: { user?: AuthUser },
    @Param("conversationId") conversationId: string,
    @Body() dto: SendInstagramMessageRequestDto,
  ): Promise<SendInstagramMessageResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return this.conversationsService.sendMessageForConversation(
      ownerId,
      conversationId,
      dto.message,
      dto.reply_to_id,
    );
  }

  @Put(":id")
  @ApiOperation({
    summary: "Update conversation",
    description:
      "Set `groupId` and/or `responsible_member_id`. Member must be active in the workspace and `can_be_assigned_to_chat`. Pass null to clear assignment.",
  })
  @ApiBody({ type: UpdateConversationRequestDto })
  @ApiOkResponse({ type: ConversationRowDto })
  async updateConversation(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
    @Body() dto: UpdateConversationRequestDto,
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
    return this.conversationsService.updateConversationForOwner(
      ownerId,
      numericId,
      dto,
    );
  }

  @Get(":id/suggestions")
  @ApiOperation({
    summary: "List product suggestions linked to a conversation",
    description:
      "Returns products grouped by id (same shape as GET /api/instagram/posts/:instagramPostId/product-variants). " +
      "Each variant includes `referenceId` = product_suggestions.id.",
  })
  @ApiOkResponse({ type: ConversationProductSuggestionsResponseDto })
  async listProductSuggestions(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
  ): Promise<ConversationProductSuggestionsResponseDto> {
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
    return this.conversationsService.listProductSuggestionsForConversation(
      ownerId,
      numericId,
    );
  }

  @Get(":id")
  @ApiOperation({
    summary: "Get one conversation by database id (primary key)",
  })
  @ApiOkResponse({ type: ConversationRowDto })
  async getById(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
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
    return this.conversationsService.getConversationForOwnerById(
      ownerId,
      numericId,
    );
  }
}
