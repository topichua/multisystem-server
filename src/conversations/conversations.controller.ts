import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
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
import { ConversationEventsListResponseDto } from "./dto/http/conversation-events-list-response.dto";
import { ConversationResponsibleMembersResponseDto } from "./dto/http/conversation-responsible-members-response.dto";
import { ProductSuggestionItemDto } from "./dto/http/conversation-product-suggestions-response.dto";
import { CreateProductSuggestionRequestDto } from "./dto/http/create-product-suggestion-request.dto";
import { SendInstagramMessageRequestDto } from "./dto/http/send-instagram-message-request.dto";
import { SendInstagramMessageResponseDto } from "./dto/http/send-instagram-message-response.dto";
import { InstagramGraphMessagesResponseDto } from "./dto/http/instagram-graph-messages-response.dto";
import { ListInstagramGraphMessagesQueryDto } from "./dto/http/list-instagram-graph-messages-query.dto";
import { ConversationChannelCriteriaResponseDto } from "./dto/http/conversations-channel-criteria-response.dto";
import { ConversationGroupingBy } from "./dto/http/conversation-grouping-by.enum";
import { ConversationsGroupsResponseDto } from "./dto/http/conversations-groups-response.dto";
import {
  isConversationCreatedAtBucket,
  type ConversationCreatedAtBucket,
} from "./conversation-created-at-bucket.logic";

type UploadedConversationMessageFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
  size?: number;
};

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
      "Returns conversations for the workspace from JWT session `workspaceId`. " +
      "Owners and roles with `conversations.full_access` see all chats. " +
      "Otherwise, results are built from the role's integration grants: each grant matches conversations by integration source and `external_source_id`; `read=all` returns all chats on that integration, `read=mine` only chats where you are responsible. " +
      "Optional `groupIds`: comma-separated positive integers (e.g. `1,2,3`). Only conversations whose `group_id` is in that set are returned. Every id must exist in the workspace. " +
      "Optional `grouping_by` and `grouping_id`: pass `by` and an item `key` returned by GET /conversations/groups. " +
      "This supports responsible, status, createdAt, and channel buckets. " +
      "Existing `groupIds` conversation-group filtering remains supported. " +
      "Optional `show_without_responsible_only=true`: only unassigned chats (`responsible_member_id` null) you can access (takeable queue / unassigned inbox). " +
      "Optional `channel_ids`: comma-separated integration ids from GET /conversations/criteria (e.g. `1,2`). " +
      "Optional `responsible_user_ids`: comma-separated workspace member ids from GET /conversations/criteria `responsibleUsers` (e.g. `5,7`). " +
      "Optional `created_at_bucket`: `today` | `last_week` | `last_month` | `long_ago` (Europe/Kyiv calendar windows from GET /conversations/groups?by=createdAt). " +
      "Optional `keyword`: search in participant Instagram/Telegram name or username and linked CRM client first/last name (case-insensitive). " +
      "Optional `unread_only=true`: return only conversations where `isUnread` is true in the list payload. " +
      "Response includes `counters` (total, unread, withoutResponsible) for the shared filters above, excluding list-only filters.",
  })
  @ApiQuery({
    name: "groupIds",
    required: false,
    description:
      "Comma-separated conversation group ids, e.g. `1,2`. Omit for all active groups (excludes archived and spam).",
    example: "1,2",
  })
  @ApiQuery({
    name: "grouping_by",
    required: false,
    enum: ConversationGroupingBy,
    description:
      "Grouping dimension used for GET /conversations/groups. Required with grouping_id.",
    example: ConversationGroupingBy.status,
  })
  @ApiQuery({
    name: "grouping_id",
    required: false,
    description:
      "Bucket `key` returned by GET /conversations/groups?by=<grouping_by>. Required with grouping_by.",
    example: "12",
  })
  @ApiQuery({
    name: "channel_ids",
    required: false,
    description:
      "Comma-separated integration ids from GET /conversations/criteria, e.g. `1,2`.",
    example: "1,2",
  })
  @ApiQuery({
    name: "responsible_user_ids",
    required: false,
    description:
      "Comma-separated workspace member ids from GET /conversations/criteria `responsibleUsers`, e.g. `5,7`.",
    example: "5,7",
  })
  @ApiQuery({
    name: "show_without_responsible_only",
    required: false,
    type: Boolean,
    description:
      "When true, return only conversations with no responsible member that you can access.",
    example: true,
  })
  @ApiQuery({
    name: "created_at_bucket",
    required: false,
    enum: ["today", "last_week", "last_month", "long_ago"],
    description:
      "Filter by conversation creation-time bucket (Europe/Kyiv). Keys match GET /conversations/groups?by=createdAt.",
    example: "today",
  })
  @ApiQuery({
    name: "keyword",
    required: false,
    description:
      "Case-insensitive substring match in Instagram/Telegram participant name or username, and linked CRM client first/last name.",
    example: "Ivan",
  })
  @ApiQuery({
    name: "unread_only",
    required: false,
    type: Boolean,
    description:
      "When true, return only conversations where `isUnread` is true (latest customer message newer than `read_at`, or never opened).",
    example: true,
  })
  @ApiOkResponse({ type: ConversationsListResponseDto })
  async getAll(
    @Req() req: { user?: AuthUser },
    @Query("groupIds") groupIdsRaw?: string | string[],
    @Query("grouping_by") groupingByRaw?: string,
    @Query("grouping_id") groupingIdRaw?: string,
    @Query("channel_ids") channelIdsRaw?: string | string[],
    @Query("responsible_user_ids") responsibleUserIdsRaw?: string | string[],
    @Query("show_without_responsible_only")
    showWithoutResponsibleOnlyRaw?: string,
    @Query("created_at_bucket") createdAtBucketRaw?: string,
    @Query("keyword") keywordRaw?: string,
    @Query("unread_only") unreadOnlyRaw?: string,
  ): Promise<ConversationsListResponseDto> {
    const ownerId = Number(req.user?.userId);
    const sessionWorkspaceId = req.user?.workspaceId;
    if (sessionWorkspaceId == null) {
      throw new BadRequestException("workspaceId is required in JWT session");
    }
    const groupIds = this.parseOptionalPositiveIntIdsQuery(
      groupIdsRaw,
      "groupIds",
    );
    const groupingBy =
      this.parseOptionalConversationGroupingByQuery(groupingByRaw);
    const groupingId = this.parseOptionalKeywordQuery(groupingIdRaw);
    if ((groupingBy == null) !== (groupingId == null)) {
      throw new BadRequestException(
        "grouping_by and grouping_id must be provided together",
      );
    }
    const channelIds = this.parseOptionalPositiveIntIdsQuery(
      channelIdsRaw,
      "channel_ids",
    );
    const responsibleUserIds = this.parseOptionalPositiveIntIdsQuery(
      responsibleUserIdsRaw,
      "responsible_user_ids",
    );
    const showWithoutResponsibleOnly = this.parseOptionalBooleanQuery(
      showWithoutResponsibleOnlyRaw,
      "show_without_responsible_only",
    );
    const createdAtBucket =
      this.parseOptionalCreatedAtBucketQuery(createdAtBucketRaw);
    const keyword = this.parseOptionalKeywordQuery(keywordRaw);
    const unreadOnly = this.parseOptionalBooleanQuery(
      unreadOnlyRaw,
      "unread_only",
    );
    return this.conversationsService.listConversationsForOwner(ownerId, {
      sessionWorkspaceId,
      groupIds,
      groupingBy,
      groupingId,
      channelIds,
      responsibleUserIds,
      showWithoutResponsibleOnly,
      createdAtBucket,
      keyword,
      unreadOnly,
      appRole: req.user?.role,
    });
  }

  @Get("groups")
  @ApiOperation({
    summary: "Aggregate conversations into grouping buckets",
    description:
      "Returns bucket keys, labels, and counts for one grouping dimension. " +
      "Required `by`: `responsible` | `status` | `createdAt` | `channel`. " +
      "Spam chats are excluded. For `responsible`, `createdAt`, and `channel`, archived is also excluded " +
      "(same base as GET /conversations without groupIds). For `by=status`, only spam is excluded. " +
      "Use returned keys with existing list filters: `responsible_user_ids` / `show_without_responsible_only`, " +
      "or pass `grouping_by` and the returned item `key` as `grouping_id` to GET /conversations.",
  })
  @ApiQuery({
    name: "by",
    required: true,
    enum: ConversationGroupingBy,
    description: "Grouping dimension.",
    example: ConversationGroupingBy.responsible,
  })
  @ApiOkResponse({ type: ConversationsGroupsResponseDto })
  async getGroups(
    @Req() req: { user?: AuthUser },
    @Query("by") byRaw?: string,
  ): Promise<ConversationsGroupsResponseDto> {
    const ownerId = Number(req.user?.userId);
    const sessionWorkspaceId = req.user?.workspaceId;
    if (sessionWorkspaceId == null) {
      throw new BadRequestException("workspaceId is required in JWT session");
    }
    const by = this.parseConversationGroupingByQuery(byRaw);
    return this.conversationsService.listConversationGroupsBy(ownerId, {
      sessionWorkspaceId,
      by,
      appRole: req.user?.role,
    });
  }

  @Get("criteria")
  @ApiOperation({
    summary: "List conversation filter criteria for the current user",
    description:
      "Returns `channels` (integration id, name, type) for `channel_ids` filter on GET /conversations, " +
      "and `responsibleUsers` (workspace member id, name, email, avatar) for `responsible_user_ids` filter — " +
      "distinct responsibles on integrations where your grant has `assignResponsibility`. " +
      "Owners and roles with `conversations.full_access` see all workspace responsibles. " +
      "Otherwise, only integrations granted with `assignResponsibility`.",
  })
  @ApiOkResponse({ type: ConversationChannelCriteriaResponseDto })
  async getCriteria(
    @Req() req: { user?: AuthUser },
  ): Promise<ConversationChannelCriteriaResponseDto> {
    const ownerId = Number(req.user?.userId);
    const sessionWorkspaceId = req.user?.workspaceId;
    if (sessionWorkspaceId == null) {
      throw new BadRequestException("workspaceId is required in JWT session");
    }
    return this.conversationsService.getConversationCriteriaForOwner(ownerId, {
      sessionWorkspaceId,
      appRole: req.user?.role,
    });
  }

  /**
   * Accepts `?groupIds=1,2` or repeated `groupIds` (framework-dependent).
   * Empty / absent → undefined (no filter).
   */
  private parseOptionalKeywordQuery(raw?: string): string | undefined {
    if (raw == null) {
      return undefined;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
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

  private parseOptionalCreatedAtBucketQuery(
    raw?: string,
  ): ConversationCreatedAtBucket | undefined {
    if (raw == null || raw.trim() === "") {
      return undefined;
    }
    const value = raw.trim();
    if (!isConversationCreatedAtBucket(value)) {
      throw new BadRequestException(
        "created_at_bucket must be one of: today, last_week, last_month, long_ago",
      );
    }
    return value;
  }

  private parseOptionalConversationGroupingByQuery(
    raw?: string,
  ): ConversationGroupingBy | undefined {
    if (raw == null || raw.trim() === "") {
      return undefined;
    }
    const value = raw.trim();
    if (
      !Object.values(ConversationGroupingBy).includes(
        value as ConversationGroupingBy,
      )
    ) {
      throw new BadRequestException(
        "grouping_by must be one of: responsible, status, createdAt, channel",
      );
    }
    return value as ConversationGroupingBy;
  }

  private parseConversationGroupingByQuery(
    raw?: string,
  ): ConversationGroupingBy {
    const value = this.parseOptionalConversationGroupingByQuery(raw);
    if (value == null) {
      throw new BadRequestException(
        "by is required (responsible | status | createdAt | channel)",
      );
    }
    return value;
  }

  private parseOptionalPositiveIntIdsQuery(
    raw: string | string[] | undefined,
    paramName: string,
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
            `${paramName} must be comma-separated positive integers; invalid segment: "${part.trim()}"`,
          );
        }
        const n = Number(t);
        if (!Number.isInteger(n) || n <= 0) {
          throw new BadRequestException(
            `${paramName} must be comma-separated positive integers; invalid segment: "${part.trim()}"`,
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
    description:
      "Same access rules as GET /conversations. Takeable queue chats (`canTakeChat` on list) are not readable until assigned.",
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
    const sessionWorkspaceId = req.user?.workspaceId;
    if (sessionWorkspaceId == null) {
      throw new BadRequestException("workspaceId is required in JWT session");
    }
    const { page, pageSize } =
      this.conversationsService.parseDbPagingForMessages(pageRaw, pageSizeRaw);
    return this.conversationsService.getInstagramMessagesForConversation(
      ownerId,
      conversationId,
      {
        page,
        pageSize,
        sessionWorkspaceId,
        appRole: req.user?.role,
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
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  @ApiConsumes("multipart/form-data", "application/json")
  @ApiOperation({
    summary:
      "Send a message in this thread (Instagram or Telegram). `reply_to_id` is optional: omit for a normal message; set to a parent message id from GET .../messages (Instagram Graph `mid` or Telegram `tg:{chatId}:{messageId}`). " +
      "Telegram and Instagram: optional multipart `file` with `type` (`image`, `video`, or `audio`) and optional `message` caption. " +
      "Instagram: within 24h of the last customer message uses `RESPONSE`; within 7 days uses `MESSAGE_TAG` + `HUMAN_AGENT`; after 7 days returns 400. " +
      "Requires `write` on the conversation integration grant, or owner / conversations.full_access.",
  })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description:
            "Text body or media caption. Required when no file is uploaded.",
        },
        reply_to_id: {
          type: "string",
          nullable: true,
          description:
            "Parent message id from GET .../messages (Instagram Graph mid or Telegram tg:{chatId}:{messageId}).",
        },
        type: {
          type: "string",
          enum: ["image", "video", "audio"],
          description: "Required when uploading `file`.",
        },
        file: { type: "string", format: "binary" },
      },
    },
  })
  @ApiOkResponse({ type: SendInstagramMessageResponseDto })
  async sendMessageByConversationId(
    @Req() req: { user?: AuthUser },
    @Param("conversationId") conversationId: string,
    @Body() dto: SendInstagramMessageRequestDto,
    @UploadedFile() file?: UploadedConversationMessageFile,
  ): Promise<SendInstagramMessageResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }

    const hasFile = file != null && file.buffer.length > 0;
    const message = dto.message?.trim() ?? "";
    if (!hasFile && message.length === 0) {
      throw new BadRequestException("message or file is required");
    }
    if (hasFile && !dto.type) {
      throw new BadRequestException(
        "type is required when sending a file (image, video, or audio)",
      );
    }

    return this.conversationsService.sendMessageForConversation(
      ownerId,
      conversationId,
      message,
      dto.reply_to_id,
      hasFile ? file : undefined,
      dto.type,
    );
  }

  @Post(":id/take")
  @ApiOperation({
    summary: "Take conversation",
    description:
      "Assigns the current workspace member as responsible and sets status to `new` (pending). " +
      "Requires `canTakeChat` on the matching integration grant, or owner / conversations.full_access.",
  })
  @ApiOkResponse({ type: ConversationRowDto })
  async takeConversation(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
  ): Promise<ConversationRowDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    const sessionWorkspaceId = req.user?.workspaceId;
    if (sessionWorkspaceId == null) {
      throw new BadRequestException("workspaceId is required in JWT session");
    }
    const numericId = Number(id);
    if (
      !Number.isInteger(numericId) ||
      numericId <= 0 ||
      !/^\d+$/.test(id.trim())
    ) {
      throw new BadRequestException("id must be a positive integer");
    }
    return this.conversationsService.takeConversationForUser(
      ownerId,
      numericId,
      {
        sessionWorkspaceId,
        appRole: req.user?.role,
      },
    );
  }

  @Put(":id")
  @ApiOperation({
    summary: "Update conversation",
    description:
      "Set `groupId` (status column: new / processing / archived or custom) and/or `responsible_member_id`. " +
      "`responsible_member_id` requires `assignResponsibility` on the conversation integration grant. " +
      "Member must be active in the workspace and have permission to take chats for this integration. Pass null to clear responsible assignment.",
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

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Hard-delete a conversation",
    description:
      "Permanently deletes the conversation row and cascaded messages/events/suggestions. " +
      "Orders keep their rows with `conversation_id` set to null. Requires write access on the conversation.",
  })
  @ApiNoContentResponse({ description: "Conversation deleted" })
  async deleteConversation(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
  ): Promise<void> {
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
    await this.conversationsService.deleteConversationForOwner(
      ownerId,
      numericId,
      {
        sessionWorkspaceId: req.user?.workspaceId,
        appRole: req.user?.role,
      },
    );
  }

  @Get(":id/responsible-members")
  @ApiOperation({
    summary: "List members assignable as responsible for a conversation",
    description:
      "Returns active workspace members who can be assigned as responsible for this conversation, " +
      "based on conversation source/integration and each member's effective grants " +
      "(`canTakeChat`, or owner / conversations.full_access). " +
      "Caller must have `assignResponsibility` on the conversation integration (or owner / full_access).",
  })
  @ApiOkResponse({ type: ConversationResponsibleMembersResponseDto })
  async listResponsibleMembers(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
  ): Promise<ConversationResponsibleMembersResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    const sessionWorkspaceId = req.user?.workspaceId;
    if (sessionWorkspaceId == null) {
      throw new BadRequestException("workspaceId is required in JWT session");
    }
    const numericId = Number(id);
    if (
      !Number.isInteger(numericId) ||
      numericId <= 0 ||
      !/^\d+$/.test(id.trim())
    ) {
      throw new BadRequestException("id must be a positive integer");
    }
    return this.conversationsService.listAssignableResponsibleMembersForConversation(
      ownerId,
      numericId,
      {
        sessionWorkspaceId,
        appRole: req.user?.role,
      },
    );
  }

  @Get(":id/events")
  @ApiOperation({
    summary: "Conversation change history",
    description:
      "Append-only log of group/status and responsible-member changes for this conversation.",
  })
  @ApiOkResponse({ type: ConversationEventsListResponseDto })
  async listConversationEvents(
    @Req() req: { user?: AuthUser },
    @Param("id") id: string,
  ): Promise<ConversationEventsListResponseDto> {
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
    return this.conversationsService.listConversationEventsForOwner(
      ownerId,
      numericId,
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
      {
        sessionWorkspaceId: req.user?.workspaceId,
        appRole: req.user?.role,
      },
    );
  }
}
