import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  Brackets,
  FindOptionsWhere,
  In,
  IsNull,
  Repository,
  SelectQueryBuilder,
  WhereExpressionBuilder,
} from "typeorm";
import {
  InstagramIntegration,
  Conversation,
  ConversationGroup,
  ConversationMessage,
  ConversationMessageType,
  ConversationSource,
  ConversationGroupSystemKey,
  CONVERSATION_GROUP_SYSTEM_KEYS_HIDDEN_FROM_DEFAULT_LIST,
  InstagramUser,
  TelegramUser,
  TelegramIntegration,
  TelegramIntegrationStatus,
  WorkspaceMember,
  WorkspaceMemberStatus,
  ProductSuggestion,
  Product,
  ProductVariant,
  ClientLink,
} from "../database/entities";
import type {
  InstagramConversationDto,
  InstagramConversationParticipantDto,
  InstagramConversationsResponseDto,
} from "./dto/http/instagram-conversations-response.dto";
import type {
  InstagramMessageDto,
  InstagramMessagesResponseDto,
} from "./dto/http/instagram-messages-response.dto";
import { ConversationMessageNotifyService } from "./conversation-message-notify.service";
import { ConversationMessagePresenterService } from "./conversation-message-presenter.service";
import { ConversationMediaArchiveService } from "./conversation-media-archive.service";
import {
  resolveMessageTypeFromAttachments,
  serializeAttachmentsJson,
  type StoredMessageAttachment,
} from "./conversation-message-attachments-json.util";
import { ConversationEventsService } from "./conversation-events.service";
import { ConversationGroupDefaultsService } from "./conversation-group-defaults.service";
import { ConversationWorkflowService } from "./conversation-workflow.service";
import { mergeMessageJsonPreservingReactions } from "./instagram-message-reactions.util";
import { INSTAGRAM_GRAPH_MESSAGE_ATTACHMENTS_FIELDS } from "./instagram-graph-message-fields";
import type { SendInstagramMessageResponseDto } from "./dto/http/send-instagram-message-response.dto";
import type { OutboundConversationMessageMediaType } from "./dto/http/send-instagram-message-request.dto";
import {
  TELEGRAM_CONVERSATION_MESSAGING,
  type TelegramConversationMessagingPort,
} from "../telegram-integrations/telegram-integrations.tokens";
import { TelegramUsersService } from "../telegram-integrations/telegram-users.service";
import { InstagramUsersService } from "../instagram/instagram-users.service";
import { ProductsService } from "../products/products.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { WorkspacePermissionsService } from "../workspace-access/workspace-permissions.service";
import { resolveWorkspaceMemberColor } from "../workspace-access/workspace-member-color.util";
import {
  canAssignConversationResponsibility,
  canTakeChat,
} from "../workspace-access/permissions/permissions-resolver";
import type { IntegrationType } from "../integrations/integration-type";
import type {
  ResolvedIntegrationGrant,
  ResolvedUserPermissions,
} from "../workspace-access/permissions/resolved-permissions.type";
import type {
  ConversationRowDto,
  ConversationParticipantDto,
} from "./dto/http/conversations-list-response.dto";
import type { User } from "../database/entities/user.entity";
import type { ConversationEventsListResponseDto } from "./dto/http/conversation-events-list-response.dto";
import type { ConversationResponsibleMembersResponseDto } from "./dto/http/conversation-responsible-members-response.dto";
import type { UpdateConversationRequestDto } from "./dto/http/update-conversation-request.dto";
import type { ConversationProductSuggestionsResponseDto } from "./dto/http/conversation-product-suggestions-response.dto";
import type { ProductSuggestionItemDto } from "./dto/http/conversation-product-suggestions-response.dto";
import type { CreateProductSuggestionRequestDto } from "./dto/http/create-product-suggestion-request.dto";
import type { InstagramGraphMessagesResponseDto } from "./dto/http/instagram-graph-messages-response.dto";
import type { ListInstagramGraphMessagesQueryDto } from "./dto/http/list-instagram-graph-messages-query.dto";
import { ConversationGroupingBy } from "./dto/http/conversation-grouping-by.enum";
import type {
  ConversationGroupBucketItemDto,
  ConversationsGroupsResponseDto,
} from "./dto/http/conversations-groups-response.dto";
import {
  applyCreatedAtBucketToQuery,
  CONVERSATION_CREATED_AT_BUCKET_LABELS,
  CONVERSATION_CREATED_AT_BUCKETS,
  isConversationCreatedAtBucket,
  resolveConversationCreatedAtBucket,
  type ConversationCreatedAtBucket,
} from "./conversation-created-at-bucket.logic";
type InstagramErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

const INSTAGRAM_RESPONSE_WINDOW_HOURS = 24;
const INSTAGRAM_HUMAN_AGENT_WINDOW_HOURS = 168;
const INSTAGRAM_REPLY_WINDOW_EXPIRED_MESSAGE =
  "Instagram дозволяє відповідати тільки до 7 днів після останнього повідомлення клієнта";

type InstagramMessagingSendMode =
  | { messagingType: "RESPONSE" }
  | { messagingType: "MESSAGE_TAG"; tag: "HUMAN_AGENT" };

const INSTAGRAM_GRAPH_CONVERSATION_MESSAGES_FIELDS =
  "id,created_time,from,to,message,attachments,shares";

@Injectable()
export class ConversationsService {
  private readonly log = new Logger(ConversationsService.name);

  constructor(
    @InjectRepository(InstagramIntegration)
    private readonly instagramIntegrationRepo: Repository<InstagramIntegration>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationGroup)
    private readonly conversationGroupRepo: Repository<ConversationGroup>,
    @InjectRepository(ConversationMessage)
    private readonly conversationMessageRepo: Repository<ConversationMessage>,
    @InjectRepository(InstagramUser)
    private readonly instagramUserRepo: Repository<InstagramUser>,
    @InjectRepository(TelegramUser)
    private readonly telegramUserRepo: Repository<TelegramUser>,
    @InjectRepository(TelegramIntegration)
    private readonly telegramIntegrationRepo: Repository<TelegramIntegration>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepo: Repository<WorkspaceMember>,
    @InjectRepository(ProductSuggestion)
    private readonly productSuggestionRepo: Repository<ProductSuggestion>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly productVariantRepo: Repository<ProductVariant>,
    @InjectRepository(ClientLink)
    private readonly clientLinkRepo: Repository<ClientLink>,
    private readonly messagePresenter: ConversationMessagePresenterService,
    private readonly mediaArchive: ConversationMediaArchiveService,
    @Inject(forwardRef(() => ConversationMessageNotifyService))
    private readonly messageNotify: ConversationMessageNotifyService,
    @Inject(TELEGRAM_CONVERSATION_MESSAGING)
    private readonly telegramMessaging: TelegramConversationMessagingPort,
    private readonly telegramUsers: TelegramUsersService,
    private readonly instagramUsers: InstagramUsersService,
    private readonly products: ProductsService,
    private readonly conversationWorkflow: ConversationWorkflowService,
    private readonly conversationEvents: ConversationEventsService,
    private readonly conversationGroupDefaults: ConversationGroupDefaultsService,
    private readonly workspacePermissions: WorkspacePermissionsService,
  ) {}

  async getConversationCriteriaForOwner(
    ownerId: number,
    filters: {
      sessionWorkspaceId: number;
      appRole?: string;
    },
  ): Promise<{
    channels: Array<{
      integrationId: number;
      name: string;
      type: "instagram" | "telegram";
    }>;
    responsibleUsers: Array<{
      id: number;
      name: string;
      email: string;
      avatar: string | null;
    }>;
  }> {
    const workspaceId = await this.resolveWorkspaceIdForConversationList(
      ownerId,
      filters.sessionWorkspaceId,
    );
    const permissions = await this.workspacePermissions.getResolvedForUser(
      ownerId,
      filters.appRole,
      workspaceId,
    );
    const [channels, responsibleUsers] = await Promise.all([
      this.resolveAccessibleConversationChannels(workspaceId, permissions),
      this.resolveAccessibleResponsibleUsers(workspaceId, ownerId, permissions),
    ]);
    return { channels, responsibleUsers };
  }

  /**
   * Aggregate accessible conversations into buckets for one grouping dimension.
   * Spam is always excluded. For non-status dimensions, archived is also excluded
   * (same default list base as GET /conversations without groupIds).
   */
  async listConversationGroupsBy(
    ownerId: number,
    filters: {
      sessionWorkspaceId: number;
      by: ConversationGroupingBy;
      appRole?: string;
    },
  ): Promise<ConversationsGroupsResponseDto> {
    const workspaceId = await this.resolveWorkspaceIdForConversationList(
      ownerId,
      filters.sessionWorkspaceId,
    );
    await this.conversationGroupDefaults.ensureSystemGroups(workspaceId);

    const permissions = await this.workspacePermissions.getResolvedForUser(
      ownerId,
      filters.appRole,
      workspaceId,
    );

    const groupFilter =
      filters.by === ConversationGroupingBy.status
        ? {
            excludeGroupIds:
              await this.conversationGroupDefaults.resolveSystemGroupIds(
                workspaceId,
                [ConversationGroupSystemKey.SPAM],
              ),
          }
        : await this.resolveListGroupFilter(workspaceId, undefined);

    const rows =
      permissions.isOwner || permissions.conversations.fullAccess
        ? await this.findConversationsForWorkspace(workspaceId, groupFilter)
        : await this.findConversationsForIntegrationGrants(
            workspaceId,
            ownerId,
            permissions.integrationGrants,
            groupFilter,
          );

    switch (filters.by) {
      case ConversationGroupingBy.responsible:
        return {
          by: filters.by,
          ...(await this.aggregateConversationsByResponsible(
            workspaceId,
            rows,
          )),
        };
      case ConversationGroupingBy.status:
        return {
          by: filters.by,
          ...(await this.aggregateConversationsByStatus(workspaceId, rows)),
        };
      case ConversationGroupingBy.createdAt:
        return {
          by: filters.by,
          ...this.aggregateConversationsByCreatedAt(rows),
        };
      case ConversationGroupingBy.channel:
        return {
          by: filters.by,
          ...(await this.aggregateConversationsByChannel(
            workspaceId,
            permissions,
            rows,
          )),
        };
      default:
        throw new BadRequestException(
          `Unsupported conversations groups by=${String(filters.by)}`,
        );
    }
  }

  /** Accessible conversation counts per `group_id` (owners / full_access / grants). */
  async getConversationDistributionByGroupForUser(
    userId: number,
    context: { sessionWorkspaceId: number; appRole?: string },
  ): Promise<{ byGroupId: Map<number, number>; total: number }> {
    const workspaceId = await this.resolveWorkspaceIdForConversationList(
      userId,
      context.sessionWorkspaceId,
    );
    const permissions = await this.workspacePermissions.getResolvedForUser(
      userId,
      context.appRole,
      workspaceId,
    );

    if (permissions.isOwner || permissions.conversations.fullAccess) {
      const rows = await this.countConversationsByGroupQuery(workspaceId);
      const hiddenGroupIds =
        await this.resolveHiddenSystemGroupIds(workspaceId);
      return this.mapConversationDistributionRows(rows, hiddenGroupIds);
    }

    const grantContext = await this.prepareIntegrationGrantListContext(
      workspaceId,
      userId,
      permissions.integrationGrants,
    );
    if (grantContext == null) {
      return { byGroupId: new Map(), total: 0 };
    }

    const qb = this.conversationRepo
      .createQueryBuilder("c")
      .select("c.group_id", "groupId")
      .addSelect("COUNT(*)::int", "count")
      .where("c.workspace_id = :workspaceId", { workspaceId })
      .andWhere(
        new Brackets((sub) => {
          this.applyIntegrationGrantAccessWhere(
            sub,
            grantContext.effectiveGrants,
            grantContext.memberId,
            grantContext.instagramById,
            grantContext.telegramById,
          );
        }),
      )
      .groupBy("c.group_id");

    const rows = await qb.getRawMany<{
      groupId: string | null;
      count: string;
    }>();
    const hiddenGroupIds = await this.resolveHiddenSystemGroupIds(workspaceId);
    return this.mapConversationDistributionRows(rows, hiddenGroupIds);
  }

  async listConversationsForOwner(
    ownerId: number,
    filters: {
      sessionWorkspaceId: number;
      groupIds?: number[];
      groupingBy?: ConversationGroupingBy;
      groupingId?: string;
      channelIds?: number[];
      responsibleUserIds?: number[];
      showWithoutResponsibleOnly?: boolean;
      unreadOnly?: boolean;
      keyword?: string;
      createdAtBucket?: ConversationCreatedAtBucket;
      appRole?: string;
    },
  ): Promise<{
    items: ConversationRowDto[];
    counters: {
      total: number;
      unread: number;
      withoutResponsible: number;
    };
  }> {
    const workspaceId = await this.resolveWorkspaceIdForConversationList(
      ownerId,
      filters.sessionWorkspaceId,
    );
    await this.conversationGroupDefaults.ensureSystemGroups(workspaceId);

    const permissions = await this.workspacePermissions.getResolvedForUser(
      ownerId,
      filters.appRole,
      workspaceId,
    );

    const resolved = this.resolveGroupingBucketFilters(
      filters.groupingBy,
      filters.groupingId,
    );
    const groupIds = [
      ...new Set([...(filters.groupIds ?? []), ...(resolved.groupIds ?? [])]),
    ];
    const channelIdsInput = [
      ...new Set([
        ...(filters.channelIds ?? []),
        ...(resolved.channelIds ?? []),
      ]),
    ];
    const responsibleUserIds = [
      ...new Set([
        ...(filters.responsibleUserIds ?? []),
        ...(resolved.responsibleUserIds ?? []),
      ]),
    ];
    const showWithoutResponsibleOnly =
      filters.showWithoutResponsibleOnly === true ||
      resolved.showWithoutResponsibleOnly === true;
    const createdAtBucket = filters.createdAtBucket ?? resolved.createdAtBucket;
    if (
      filters.createdAtBucket != null &&
      resolved.createdAtBucket != null &&
      filters.createdAtBucket !== resolved.createdAtBucket
    ) {
      throw new BadRequestException(
        "created_at_bucket conflicts with grouping_id for createdAt",
      );
    }
    if (resolved.onlyUngrouped && groupIds.length > 0) {
      throw new BadRequestException(
        "grouping_id=ungrouped cannot be combined with groupIds",
      );
    }

    const groupFilter = await this.resolveListGroupFilter(
      workspaceId,
      groupIds.length > 0 ? groupIds : undefined,
      resolved.onlyUngrouped,
    );
    const channelIds = await this.validateOptionalChannelIds(
      workspaceId,
      permissions,
      channelIdsInput.length > 0 ? channelIdsInput : undefined,
    );
    const responsibleMemberIds = await this.validateOptionalResponsibleUserIds(
      workspaceId,
      ownerId,
      permissions,
      responsibleUserIds.length > 0 ? responsibleUserIds : undefined,
    );
    if (showWithoutResponsibleOnly && responsibleMemberIds != null) {
      throw new BadRequestException(
        "show_without_responsible_only cannot be used together with responsible_user_ids",
      );
    }
    const channelFilter =
      channelIds != null
        ? await this.buildChannelFilter(workspaceId, permissions, channelIds)
        : undefined;

    const participantIds =
      filters.keyword != null
        ? await this.resolveParticipantIdsByKeyword(
            workspaceId,
            filters.keyword,
          )
        : undefined;
    if (participantIds != null && participantIds.length === 0) {
      return {
        items: [],
        counters: { total: 0, unread: 0, withoutResponsible: 0 },
      };
    }

    const baseRows =
      permissions.isOwner || permissions.conversations.fullAccess
        ? await this.findConversationsForWorkspace(
            workspaceId,
            groupFilter,
            undefined,
            channelFilter,
            undefined,
            participantIds,
            createdAtBucket,
          )
        : await this.findConversationsForIntegrationGrants(
            workspaceId,
            ownerId,
            permissions.integrationGrants,
            groupFilter,
            undefined,
            channelFilter,
            undefined,
            participantIds,
            createdAtBucket,
          );

    const listAccessContext =
      permissions.isOwner || permissions.conversations.fullAccess
        ? null
        : await this.buildConversationListAccessContext(
            workspaceId,
            ownerId,
            permissions.integrationGrants,
          );

    const integration = await this.instagramIntegrationRepo.findOne({
      where: { workspaceId },
      order: { id: "DESC" },
    });
    const myAccountIds = await this.buildMyAccountIdsForWorkspace(
      workspaceId,
      integration,
    );
    const lastMessageByConversationId =
      await this.getLastMessageByConversationIds(baseRows.map((r) => r.id));
    const { instagramById, telegramById } =
      await this.getParticipantMapsForRows(baseRows, { maxTelegramSync: 10 });

    const allItems = baseRows.map((r) =>
      this.toConversationRowDto(
        r,
        lastMessageByConversationId.get(r.id),
        instagramById,
        telegramById,
        myAccountIds,
        listAccessContext
          ? this.resolveConversationActionFlags(
              r,
              permissions,
              listAccessContext,
            )
          : this.resolveConversationActionFlags(r, permissions, null),
      ),
    );

    const counters = {
      total: allItems.length,
      unread: allItems.filter((item) => item.isUnread).length,
      withoutResponsible: allItems.filter(
        (item) => item.responsibleMemberId == null,
      ).length,
    };

    let items = allItems;
    if (showWithoutResponsibleOnly) {
      items = items.filter((item) => item.responsibleMemberId == null);
    }
    if (responsibleMemberIds != null && responsibleMemberIds.length > 0) {
      const allowed = new Set(responsibleMemberIds);
      items = items.filter(
        (item) =>
          item.responsibleMemberId != null &&
          allowed.has(item.responsibleMemberId),
      );
    }
    if (filters.unreadOnly) {
      items = items.filter((item) => item.isUnread);
    }

    return { items, counters };
  }

  /**
   * Pulls the Instagram conversation list for the company page and upserts `conversations` rows
   * for the workspace.
   */
  async syncInstagramConversationsForOwner(
    ownerId: number,
  ): Promise<{ upserted: number }> {
    const integration =
      await this.workspaceContext.requireInstagramIntegrationForOwner(ownerId);
    const pageId = integration.pageId?.trim();
    if (!pageId) {
      throw new BadRequestException(
        "Instagram page id is not configured; connect Instagram via POST /integrations",
      );
    }
    const token = await this.resolveGraphAccessToken(integration.id);
    const conversations = await this.fetchAllInstagramConversations(
      pageId,
      token,
    );
    await this.enrichParticipantProfilePics(
      { data: conversations, paging: undefined },
      token,
    );

    const participantIds = new Set<string>();
    for (const ig of conversations) {
      for (const p of ig.participants?.data ?? []) {
        const id = p.id?.trim();
        if (id) participantIds.add(id);
      }
    }
    if (participantIds.size > 0) {
      await this.instagramUsers.syncMissingFromGraph(
        integration.workspaceId,
        [...participantIds],
        {
          pageAccessToken: token,
          userAccessToken: integration.userAccessToken,
          businessAccountId: integration.instagramAccountId,
          pageId: integration.pageId,
        },
        { maxSync: participantIds.size },
      );
    }

    let upserted = 0;
    for (const ig of conversations) {
      const externalId = ig.id?.trim();
      if (!externalId) continue;
      const participantId = this.pickCustomerParticipantId(
        ig.participants?.data ?? [],
        pageId,
      );
      const instUpdatedAt = new Date(ig.updated_time);
      if (Number.isNaN(instUpdatedAt.getTime())) continue;

      let row = await this.conversationRepo.findOne({
        where: { workspaceId: integration.workspaceId, externalId },
      });
      const isNew = !row;
      if (!row) {
        row = this.conversationRepo.create({
          externalSourceId: pageId,
          externalId,
          createdAt: new Date(),
          instUpdatedAt,
          readAt: null,
          participantId,
          source: ConversationSource.INSTAGRAM,
          workspaceId: integration.workspaceId,
          groupId: null,
        });
      } else {
        row.instUpdatedAt = instUpdatedAt;
        row.participantId = participantId;
        row.externalSourceId = pageId;
        row.workspaceId = integration.workspaceId;
      }
      await this.conversationRepo.save(row);
      if (isNew) {
        await this.conversationWorkflow.onConversationCreated(row, ownerId);
      }
      upserted++;
    }
    return { upserted };
  }

  /**
   * GET `/v25.0/{message-id}?fields=…` — reusable for webhook allocation and tooling.
   */
  async fetchInstagramMessageById(
    messageId: string,
    accessToken: string,
    fields = "id,created_time,from,to,message",
  ): Promise<InstagramMessageDto> {
    const url = new URL(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(messageId)}`,
    );
    url.searchParams.set("fields", fields);
    url.searchParams.set("access_token", accessToken);
    return this.instagramGraphFetch<InstagramMessageDto>(url);
  }

  /**
   * GET `/v25.0/{page-id}/conversations?platform=instagram&user_id=…` — reusable Graph helper.
   */
  async fetchInstagramConversationsForUser(
    pageId: string,
    userId: string,
    accessToken: string,
  ): Promise<InstagramConversationDto[]> {
    const out: InstagramConversationDto[] = [];
    const fields = encodeURIComponent("id,participants,updated_time");
    let nextUrl: string | null =
      `https://graph.facebook.com/v25.0/${encodeURIComponent(pageId)}/conversations` +
      `?platform=instagram&user_id=${encodeURIComponent(userId)}&fields=${fields}&access_token=${encodeURIComponent(accessToken)}`;

    while (nextUrl) {
      const batch: InstagramConversationsResponseDto =
        await this.instagramGraphFetch<InstagramConversationsResponseDto>(
          new URL(nextUrl),
        );
      out.push(...(batch.data ?? []));
      nextUrl = batch.paging?.next ?? null;
    }
    return out;
  }

  /**
   * Updates conversation fields (group and/or responsible member).
   */
  async updateConversationForOwner(
    ownerId: number,
    conversationId: number,
    dto: UpdateConversationRequestDto,
  ): Promise<ConversationRowDto> {
    if (dto.groupId === undefined && dto.responsible_member_id === undefined) {
      throw new BadRequestException(
        "At least one of groupId or responsible_member_id is required",
      );
    }

    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const workspaceId = workspace.id;

    const conv = await this.requireConversationInWorkspace(ownerId, {
      id: conversationId,
    });

    if (dto.groupId !== undefined) {
      if (dto.groupId == null) {
        throw new BadRequestException(
          "groupId cannot be cleared; assign a conversation group (e.g. archived)",
        );
      }
      const group = await this.conversationGroupRepo.findOne({
        where: { id: dto.groupId, workspaceId },
      });
      if (!group) {
        throw new BadRequestException(
          "Conversation group not found or does not belong to this workspace",
        );
      }
      await this.conversationWorkflow.onManualGroupChange(
        conv,
        dto.groupId,
        ownerId,
      );
    }

    if (dto.responsible_member_id !== undefined) {
      await this.assertCanAssignConversationResponsibility(
        ownerId,
        conv,
        workspaceId,
      );

      const fromMemberId = conv.responsibleMemberId;
      if (dto.responsible_member_id == null) {
        conv.responsibleMemberId = null;
        conv.responsibleMemberSetAt = null;
      } else {
        const member = await this.workspaceMemberRepo.findOne({
          where: {
            id: dto.responsible_member_id,
            workspaceId,
            status: WorkspaceMemberStatus.ACTIVE,
          },
        });
        if (!member) {
          throw new BadRequestException(
            "Workspace member not found or does not belong to this workspace",
          );
        }
        await this.assertMemberCanReceiveConversation(
          member.userId,
          conv,
          workspaceId,
        );
        conv.responsibleMemberId = member.id;
        conv.responsibleMemberSetAt = new Date();
      }
      await this.conversationRepo.save(conv);
      await this.conversationWorkflow.onResponsibleMemberChange(
        conv,
        fromMemberId,
        conv.responsibleMemberId,
        ownerId,
      );
    }

    return this.getConversationForOwnerById(ownerId, conversationId);
  }

  private async assertCanAssignConversationResponsibility(
    userId: number,
    conversation: Conversation,
    workspaceId: number,
  ): Promise<void> {
    const permissions = await this.workspacePermissions.getResolvedForUser(
      userId,
      undefined,
      workspaceId,
    );
    if (permissions.isOwner || permissions.conversations.fullAccess) {
      return;
    }

    const integration = await this.resolveConversationIntegration(
      conversation,
      workspaceId,
    );
    if (
      integration == null ||
      !canAssignConversationResponsibility(
        permissions,
        integration.integrationType,
        integration.integrationId,
      )
    ) {
      throw new ForbiddenException(
        "Missing permission: assignResponsibility on this integration",
      );
    }
  }

  private async assertMemberCanReceiveConversation(
    userId: number,
    conversation: Conversation,
    workspaceId: number,
  ): Promise<void> {
    const permissions = await this.workspacePermissions.getResolvedForUser(
      userId,
      undefined,
      workspaceId,
    );
    if (permissions.isOwner || permissions.conversations.fullAccess) {
      return;
    }

    const integration = await this.resolveConversationIntegration(
      conversation,
      workspaceId,
    );
    if (
      integration == null ||
      !canTakeChat(
        permissions,
        integration.integrationType,
        integration.integrationId,
      )
    ) {
      throw new BadRequestException(
        "Workspace member lacks permission to take this chat",
      );
    }
  }

  private async resolveConversationIntegration(
    conversation: Conversation,
    workspaceId: number,
  ): Promise<{
    integrationType: IntegrationType;
    integrationId: number;
  } | null> {
    if (conversation.source === ConversationSource.TELEGRAM) {
      const integrationId = Number.parseInt(
        conversation.externalSourceId.trim(),
        10,
      );
      if (!Number.isInteger(integrationId) || integrationId <= 0) {
        return null;
      }
      const integration = await this.telegramIntegrationRepo.findOne({
        where: { id: integrationId, workspaceId },
      });
      if (!integration) {
        return null;
      }
      return { integrationType: "telegram", integrationId: integration.id };
    }

    if (conversation.source !== ConversationSource.INSTAGRAM) {
      return null;
    }

    const externalSourceId = conversation.externalSourceId?.trim();
    if (!externalSourceId) {
      return null;
    }

    const integrations = await this.instagramIntegrationRepo.find({
      where: { workspaceId },
    });
    const integration = integrations.find((row) => {
      const pageId = row.pageId?.trim();
      const accountId = row.instagramAccountId?.trim();
      return pageId === externalSourceId || accountId === externalSourceId;
    });
    if (!integration) {
      return null;
    }
    return { integrationType: "instagram", integrationId: integration.id };
  }

  async takeConversationForUser(
    userId: number,
    conversationId: number,
    context: { sessionWorkspaceId: number; appRole?: string },
  ): Promise<ConversationRowDto> {
    const workspaceId = await this.resolveWorkspaceIdForConversationList(
      userId,
      context.sessionWorkspaceId,
    );
    await this.conversationGroupDefaults.ensureSystemGroups(workspaceId);

    const conversation = await this.loadConversationInWorkspace(
      workspaceId,
      String(conversationId),
    );
    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const permissions = await this.workspacePermissions.getResolvedForUser(
      userId,
      context.appRole,
      workspaceId,
    );

    const member = await this.workspaceMemberRepo.findOne({
      where: {
        workspaceId,
        userId,
        status: WorkspaceMemberStatus.ACTIVE,
      },
    });
    if (!member) {
      throw new ForbiddenException("Workspace membership required");
    }
    if (
      conversation.responsibleMemberId != null &&
      conversation.responsibleMemberId !== member.id
    ) {
      throw new BadRequestException("Conversation is already assigned");
    }

    const fromMemberId = conversation.responsibleMemberId;
    const alreadyMine = fromMemberId === member.id;

    if (!alreadyMine) {
      const listAccessContext = await this.buildConversationListAccessContext(
        workspaceId,
        userId,
        permissions.integrationGrants,
      );
      const canTake =
        permissions.isOwner ||
        permissions.conversations.fullAccess ||
        this.resolveCanTakeChatFlag(conversation, listAccessContext);

      if (!canTake) {
        throw new ForbiddenException("Missing permission to take this chat");
      }

      conversation.responsibleMemberId = member.id;
      conversation.responsibleMemberSetAt = new Date();
      await this.conversationRepo.save(conversation);
    }

    await this.conversationWorkflow.onTakeChat(
      conversation,
      fromMemberId,
      userId,
    );

    return this.buildConversationRowForUser(
      userId,
      conversation.id,
      workspaceId,
      permissions,
    );
  }

  private async buildConversationRowForUser(
    userId: number,
    conversationId: number,
    workspaceId: number,
    permissions: Awaited<
      ReturnType<WorkspacePermissionsService["getResolvedForUser"]>
    >,
  ): Promise<ConversationRowDto> {
    const row = await this.conversationRepo.findOne({
      where: { id: conversationId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Conversation not found");
    }

    const integration = await this.instagramIntegrationRepo.findOne({
      where: { workspaceId },
      order: { id: "DESC" },
    });
    const myAccountIds = await this.buildMyAccountIdsForWorkspace(
      workspaceId,
      integration,
    );
    const lastMessageByConversationId =
      await this.getLastMessageByConversationIds([row.id]);
    const { instagramById, telegramById } =
      await this.getParticipantMapsForRows([row], { maxTelegramSync: 1 });

    const listAccessContext =
      permissions.isOwner || permissions.conversations.fullAccess
        ? null
        : await this.buildConversationListAccessContext(
            workspaceId,
            userId,
            permissions.integrationGrants,
          );

    return this.toConversationRowDto(
      row,
      lastMessageByConversationId.get(row.id),
      instagramById,
      telegramById,
      myAccountIds,
      listAccessContext
        ? this.resolveConversationActionFlags(
            row,
            permissions,
            listAccessContext,
          )
        : this.resolveConversationActionFlags(row, permissions, null),
    );
  }

  async getConversationForOwnerById(
    ownerId: number,
    id: number,
    context?: { sessionWorkspaceId?: number; appRole?: string },
  ): Promise<ConversationRowDto> {
    const workspaceId =
      context?.sessionWorkspaceId != null
        ? await this.resolveWorkspaceIdForConversationList(
            ownerId,
            context.sessionWorkspaceId,
          )
        : (await this.requireConversationInWorkspace(ownerId, { id }))
            .workspaceId;

    const permissions = await this.workspacePermissions.getResolvedForUser(
      ownerId,
      context?.appRole,
      workspaceId,
    );

    return this.buildConversationRowForUser(
      ownerId,
      id,
      workspaceId,
      permissions,
    );
  }

  /**
   * Active workspace members who may be assigned as responsible for this chat
   * (owner / conversations.full_access / matching integration `canTakeChat`).
   * Caller must be allowed to assign responsibility on this conversation.
   */
  async listAssignableResponsibleMembersForConversation(
    actorUserId: number,
    conversationId: number,
    context: { sessionWorkspaceId: number; appRole?: string },
  ): Promise<ConversationResponsibleMembersResponseDto> {
    const workspaceId = await this.resolveWorkspaceIdForConversationList(
      actorUserId,
      context.sessionWorkspaceId,
    );
    const conversation = await this.loadConversationInWorkspace(
      workspaceId,
      String(conversationId),
    );
    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    await this.assertCanAssignConversationResponsibility(
      actorUserId,
      conversation,
      workspaceId,
    );

    const integration = await this.resolveConversationIntegration(
      conversation,
      workspaceId,
    );
    if (integration == null) {
      throw new BadRequestException(
        "Conversation integration could not be resolved for assignment eligibility",
      );
    }

    const members = await this.workspaceMemberRepo.find({
      where: {
        workspaceId,
        status: WorkspaceMemberStatus.ACTIVE,
      },
      relations: ["user"],
      order: { id: "ASC" },
    });

    const items: ConversationResponsibleMembersResponseDto["items"] = [];
    for (const member of members) {
      if (!member.user) {
        continue;
      }
      const permissions = await this.workspacePermissions.getResolvedForUser(
        member.userId,
        undefined,
        workspaceId,
      );
      const eligible =
        permissions.isOwner ||
        permissions.conversations.fullAccess ||
        canTakeChat(
          permissions,
          integration.integrationType,
          integration.integrationId,
        );
      if (!eligible) {
        continue;
      }

      const color = resolveWorkspaceMemberColor(
        member.userId,
        workspaceId,
        member.user.avatarSrc,
        member.color,
      );
      items.push({
        id: member.id,
        userId: member.userId,
        name: this.resolveResponsibleUserDisplayName(member.user),
        email: member.user.email,
        avatar: member.user.avatarSrc ?? null,
        ...(color ? { color } : {}),
        work_status: member.workStatus,
      });
    }

    return { items };
  }

  async listConversationEventsForOwner(
    ownerId: number,
    conversationId: number,
  ): Promise<ConversationEventsListResponseDto> {
    await this.requireConversationInWorkspace(ownerId, {
      id: conversationId,
    });
    const rows =
      await this.conversationEvents.listForConversation(conversationId);
    return {
      items: rows.map((row) => ({
        id: row.id,
        conversationId: row.conversationId,
        type: row.type,
        actorId: row.actorId,
        payload: row.payload,
        createdAt: row.createdAt,
      })),
    };
  }

  async listProductSuggestionsForConversation(
    ownerId: number,
    conversationId: number,
  ): Promise<ConversationProductSuggestionsResponseDto> {
    const conv = await this.requireConversationInWorkspace(ownerId, {
      id: conversationId,
    });

    const rows = await this.productSuggestionRepo.find({
      where: { conversationId },
      order: { createdAt: "DESC", id: "DESC" },
    });

    const items = await this.products.listListItemsForInstagramReferences(
      ownerId,
      rows.map((row) => ({
        referenceId: row.id,
        productId: row.productId,
        productVariantId: row.productVariantId,
      })),
    );

    const postIds = [
      ...new Set(
        rows
          .map((row) => row.postId?.trim())
          .filter((id): id is string => !!id),
      ),
    ];

    return {
      conversationId,
      postId: postIds.length === 1 ? postIds[0] : null,
      businessAccountId: conv.externalSourceId?.trim() || null,
      items,
    };
  }

  async createProductSuggestionForOwner(
    ownerId: number,
    dto: CreateProductSuggestionRequestDto,
  ): Promise<ProductSuggestionItemDto> {
    await this.requireConversationInWorkspace(ownerId, {
      id: dto.conversationId,
    });

    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const product = await this.productRepo.findOne({
      where: { id: dto.productId, workspaceId: workspace.id },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const variantId = dto.productVariantId ?? null;
    if (variantId != null) {
      const variant = await this.productVariantRepo.findOne({
        where: { id: variantId, productId: product.id },
      });
      if (!variant) {
        throw new BadRequestException(
          "productVariantId does not belong to productId",
        );
      }
    }

    const row = await this.productSuggestionRepo.save(
      this.productSuggestionRepo.create({
        conversationId: dto.conversationId,
        productId: dto.productId,
        productVariantId: variantId,
        postId: dto.postId ?? null,
        reasonType: dto.reasonType ?? null,
      }),
    );

    return this.toProductSuggestionItem(row);
  }

  private toProductSuggestionItem(
    row: ProductSuggestion,
  ): ProductSuggestionItemDto {
    return {
      id: row.id,
      productId: row.productId,
      productVariantId: row.productVariantId,
      conversationId: row.conversationId,
      postId: row.postId,
      reasonType: row.reasonType,
      createdAt: row.createdAt,
    };
  }

  /** @deprecated Use updateConversationForOwner */
  async assignConversationGroupForOwner(
    ownerId: number,
    conversationId: number,
    groupId: number,
  ): Promise<ConversationRowDto> {
    return this.updateConversationForOwner(ownerId, conversationId, {
      groupId,
    });
  }

  private toConversationRowDto(
    row: Conversation,
    lastMessage: ConversationMessage | undefined,
    instagramById: Map<string, InstagramUser>,
    telegramById: Map<string, TelegramUser>,
    myAccountIds: Set<string>,
    actions: { canTakeChat: boolean; canAssignResponsible: boolean },
  ): ConversationRowDto {
    const participant = this.toConversationParticipantDto(
      row,
      instagramById,
      telegramById,
    );
    const isLastMessageFromMe = this.resolveIsLastMessageFromMe(
      lastMessage,
      myAccountIds,
    );
    return {
      id: row.id,
      instUpdatedAt: row.instUpdatedAt,
      isUnread: this.resolveConversationIsUnread(
        row,
        lastMessage,
        isLastMessageFromMe,
      ),
      source: row.source,
      groupId: row.groupId,
      responsibleMemberId: row.responsibleMemberId,
      responsibleMemberSetAt: row.responsibleMemberSetAt,
      lastMessage: lastMessage?.message ?? "",
      isLastMessageFromMe,
      participant,
      canTakeChat: actions.canTakeChat,
      canAssignResponsible: actions.canAssignResponsible,
    };
  }

  private async buildConversationListAccessContext(
    workspaceId: number,
    userId: number,
    grants: ResolvedIntegrationGrant[],
  ): Promise<{
    memberId: number | null;
    instagramById: Map<number, InstagramIntegration>;
    telegramById: Map<number, TelegramIntegration>;
    grants: ResolvedIntegrationGrant[];
  }> {
    const member = await this.workspaceMemberRepo.findOne({
      where: {
        workspaceId,
        userId,
        status: WorkspaceMemberStatus.ACTIVE,
      },
    });
    const { instagramById, telegramById } =
      await this.loadIntegrationMapsForGrants(workspaceId, grants);
    return {
      memberId: member?.id ?? null,
      instagramById,
      telegramById,
      grants,
    };
  }

  private resolveCanTakeChatFlag(
    conversation: Conversation,
    context: {
      memberId: number | null;
      instagramById: Map<number, InstagramIntegration>;
      telegramById: Map<number, TelegramIntegration>;
      grants: ResolvedIntegrationGrant[];
    },
  ): boolean {
    if (conversation.responsibleMemberId != null || context.memberId == null) {
      return false;
    }

    for (const grant of context.grants) {
      if (
        !this.conversationBelongsToGrant(
          conversation,
          grant,
          context.instagramById,
          context.telegramById,
        )
      ) {
        continue;
      }
      if (
        !grant.canTakeChat ||
        grant.write !== "mine" ||
        (grant.read !== "all" && grant.read !== "mine")
      ) {
        continue;
      }
      return true;
    }

    return false;
  }

  private resolveCanAssignResponsibleFlag(
    conversation: Conversation,
    context: {
      instagramById: Map<number, InstagramIntegration>;
      telegramById: Map<number, TelegramIntegration>;
      grants: ResolvedIntegrationGrant[];
    },
  ): boolean {
    for (const grant of context.grants) {
      if (!grant.assignResponsibility) {
        continue;
      }
      if (
        this.conversationBelongsToGrant(
          conversation,
          grant,
          context.instagramById,
          context.telegramById,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  private resolveConversationActionFlags(
    conversation: Conversation,
    permissions: Pick<
      ResolvedUserPermissions,
      "isOwner" | "conversations" | "integrationGrants"
    >,
    context: {
      memberId: number | null;
      instagramById: Map<number, InstagramIntegration>;
      telegramById: Map<number, TelegramIntegration>;
      grants: ResolvedIntegrationGrant[];
    } | null,
  ): { canTakeChat: boolean; canAssignResponsible: boolean } {
    const fullAccess =
      permissions.isOwner || permissions.conversations.fullAccess;

    const canAssignResponsible =
      fullAccess ||
      (context != null &&
        this.resolveCanAssignResponsibleFlag(conversation, context));

    let canTakeChat = false;
    if (conversation.responsibleMemberId == null) {
      if (fullAccess) {
        canTakeChat = true;
      } else if (context?.memberId != null) {
        canTakeChat = this.resolveCanTakeChatFlag(conversation, context);
      }
    }

    return { canTakeChat, canAssignResponsible };
  }

  private grantAllowsConversationWrite(
    conversation: Conversation,
    grant: ResolvedIntegrationGrant,
    memberId: number | null,
  ): boolean {
    if (this.isTakeableQueueConversation(conversation, grant, memberId)) {
      return false;
    }
    if (grant.write === "all") {
      return true;
    }
    return (
      grant.write === "mine" &&
      memberId != null &&
      conversation.responsibleMemberId === memberId
    );
  }

  private async isConversationWritableByGrants(
    conversation: Conversation,
    workspaceId: number,
    userId: number,
    grants: ResolvedIntegrationGrant[],
  ): Promise<boolean> {
    if (grants.length === 0) {
      return false;
    }

    const member = await this.workspaceMemberRepo.findOne({
      where: {
        workspaceId,
        userId,
        status: WorkspaceMemberStatus.ACTIVE,
      },
    });
    const memberId = member?.id ?? null;
    const { instagramById, telegramById } =
      await this.loadIntegrationMapsForGrants(workspaceId, grants);

    for (const grant of grants) {
      if (
        !this.conversationBelongsToGrant(
          conversation,
          grant,
          instagramById,
          telegramById,
        )
      ) {
        continue;
      }
      if (this.grantAllowsConversationWrite(conversation, grant, memberId)) {
        return true;
      }
    }

    return false;
  }

  private async assertCanWriteConversation(
    userId: number,
    conversation: Conversation,
  ): Promise<void> {
    const permissions = await this.workspacePermissions.getResolvedForUser(
      userId,
      undefined,
      conversation.workspaceId,
    );
    if (permissions.isOwner || permissions.conversations.fullAccess) {
      return;
    }

    const allowed = await this.isConversationWritableByGrants(
      conversation,
      conversation.workspaceId,
      userId,
      permissions.integrationGrants,
    );
    if (!allowed) {
      throw new ForbiddenException(
        "Missing permission to write on this conversation",
      );
    }
  }

  private grantAllowsConversationMessages(
    conversation: Conversation,
    grant: ResolvedIntegrationGrant,
    memberId: number | null,
  ): boolean {
    if (this.isTakeableQueueConversation(conversation, grant, memberId)) {
      return false;
    }
    if (grant.read === "all") {
      return true;
    }
    return (
      grant.read === "mine" &&
      memberId != null &&
      conversation.responsibleMemberId === memberId
    );
  }

  private isTakeableQueueConversation(
    conversation: Conversation,
    grant: ResolvedIntegrationGrant,
    memberId: number | null,
  ): boolean {
    return (
      conversation.responsibleMemberId == null &&
      memberId != null &&
      grant.canTakeChat &&
      grant.write === "mine" &&
      (grant.read === "all" || grant.read === "mine")
    );
  }

  /**
   * Unread when the latest message is from the participant (not my account) and it is
   * newer than when this user last opened the thread (`conversations.read_at`), or
   * they have never opened it (`read_at` null).
   */
  private resolveConversationIsUnread(
    row: Conversation,
    lastMessage: ConversationMessage | undefined,
    isLastMessageFromMe: boolean | null,
  ): boolean {
    if (!lastMessage) return false;
    if (isLastMessageFromMe !== false) return false;
    const lastTs = lastMessage.createdAt.getTime();
    const readTs = row.readAt?.getTime();
    if (readTs == null) return true;
    return lastTs > readTs;
  }

  private resolveIsLastMessageFromMe(
    lastMessage: ConversationMessage | undefined,
    myAccountIds: Set<string>,
  ): boolean | null {
    if (!lastMessage) return null;
    const senderId = lastMessage.senderId?.trim();
    if (!senderId || senderId === "0") return null;
    return myAccountIds.has(senderId);
  }

  private buildMyInstagramIds(company: InstagramIntegration): Set<string> {
    return new Set(
      [company.instagramAccountId, company.pageId]
        .map((x) => x?.trim())
        .filter((x): x is string => Boolean(x)),
    );
  }

  private async resolveHiddenSystemGroupIds(
    workspaceId: number,
  ): Promise<Set<number>> {
    const ids = await this.conversationGroupDefaults.resolveSystemGroupIds(
      workspaceId,
      CONVERSATION_GROUP_SYSTEM_KEYS_HIDDEN_FROM_DEFAULT_LIST,
    );
    return new Set(ids);
  }

  private async resolveListGroupFilter(
    workspaceId: number,
    groupIdsRaw?: number[],
    onlyUngrouped?: boolean,
  ): Promise<{
    includeGroupIds?: number[];
    excludeGroupIds?: number[];
    onlyUngrouped?: boolean;
  }> {
    if (onlyUngrouped) {
      return { onlyUngrouped: true };
    }
    const explicit = await this.validateOptionalGroupIds(
      workspaceId,
      groupIdsRaw,
    );
    if (explicit != null) {
      return { includeGroupIds: explicit };
    }
    const excludeGroupIds =
      await this.conversationGroupDefaults.resolveSystemGroupIds(
        workspaceId,
        CONVERSATION_GROUP_SYSTEM_KEYS_HIDDEN_FROM_DEFAULT_LIST,
      );
    return { excludeGroupIds };
  }

  private resolveGroupingBucketFilters(
    groupingBy?: ConversationGroupingBy,
    groupingId?: string,
  ): {
    groupIds?: number[];
    onlyUngrouped?: boolean;
    channelIds?: number[];
    responsibleUserIds?: number[];
    showWithoutResponsibleOnly?: boolean;
    createdAtBucket?: ConversationCreatedAtBucket;
  } {
    if (groupingBy == null || groupingId == null) {
      return {};
    }

    switch (groupingBy) {
      case ConversationGroupingBy.status: {
        if (groupingId === "ungrouped") {
          return { onlyUngrouped: true };
        }
        if (!/^\d+$/.test(groupingId)) {
          throw new BadRequestException(
            "grouping_id for status must be a conversation group id or ungrouped",
          );
        }
        return { groupIds: [Number(groupingId)] };
      }
      case ConversationGroupingBy.responsible: {
        if (groupingId === "unassigned") {
          return { showWithoutResponsibleOnly: true };
        }
        if (!/^\d+$/.test(groupingId)) {
          throw new BadRequestException(
            "grouping_id for responsible must be a member id or unassigned",
          );
        }
        return { responsibleUserIds: [Number(groupingId)] };
      }
      case ConversationGroupingBy.createdAt: {
        if (!isConversationCreatedAtBucket(groupingId)) {
          throw new BadRequestException(
            "grouping_id for createdAt must be one of: today, last_week, last_month, long_ago",
          );
        }
        return { createdAtBucket: groupingId };
      }
      case ConversationGroupingBy.channel: {
        const match = /^(instagram|telegram):(\d+)$/.exec(groupingId);
        if (!match) {
          throw new BadRequestException(
            "grouping_id for channel must look like instagram:1 or telegram:2",
          );
        }
        return { channelIds: [Number(match[2])] };
      }
      default:
        throw new BadRequestException(
          `Unsupported grouping_by=${String(groupingBy)}`,
        );
    }
  }

  private applyConversationGroupListFilter(
    qb: SelectQueryBuilder<Conversation>,
    filter: {
      includeGroupIds?: number[];
      excludeGroupIds?: number[];
      onlyUngrouped?: boolean;
    },
  ): void {
    if (filter.onlyUngrouped) {
      qb.andWhere("c.group_id IS NULL");
      return;
    }
    if (filter.includeGroupIds != null && filter.includeGroupIds.length > 0) {
      qb.andWhere("c.group_id IN (:...includeGroupIds)", {
        includeGroupIds: filter.includeGroupIds,
      });
      return;
    }
    if (filter.excludeGroupIds != null && filter.excludeGroupIds.length > 0) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where("c.group_id IS NULL")
            .orWhere("c.group_id NOT IN (:...excludeGroupIds)", {
              excludeGroupIds: filter.excludeGroupIds,
            });
        }),
      );
    }
  }

  private async validateOptionalGroupIds(
    workspaceId: number,
    groupIdsRaw?: number[],
  ): Promise<number[] | undefined> {
    const groupIds = groupIdsRaw?.filter(
      (id) => Number.isInteger(id) && id > 0,
    );
    if (groupIds == null || groupIds.length === 0) {
      return undefined;
    }
    const unique = [...new Set(groupIds)];
    const groups = await this.conversationGroupRepo.find({
      where: { workspaceId, id: In(unique) },
    });
    const found = new Set(groups.map((g) => g.id));
    const missing = unique.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown or inaccessible group id(s) for this workspace: ${missing.join(", ")}`,
      );
    }
    return unique;
  }

  private resolveInstagramChannelName(row: InstagramIntegration): string {
    return (
      row.facebookPageName?.trim() || row.name?.trim() || `Instagram #${row.id}`
    );
  }

  private resolveTelegramChannelName(row: TelegramIntegration): string {
    return (
      row.name?.trim() || row.telegramUsername?.trim() || `Telegram #${row.id}`
    );
  }

  private async resolveAccessibleConversationChannels(
    workspaceId: number,
    permissions: Pick<
      ResolvedUserPermissions,
      "isOwner" | "conversations" | "integrationGrants"
    >,
  ): Promise<
    Array<{
      integrationId: number;
      name: string;
      type: "instagram" | "telegram";
    }>
  > {
    if (permissions.isOwner || permissions.conversations.fullAccess) {
      const [instagram, telegram] = await Promise.all([
        this.instagramIntegrationRepo.find({
          where: { workspaceId },
          order: { id: "ASC" },
        }),
        this.telegramIntegrationRepo.find({
          where: { workspaceId },
          order: { id: "ASC" },
        }),
      ]);
      const channels: Array<{
        integrationId: number;
        name: string;
        type: "instagram" | "telegram";
      }> = [];
      for (const row of instagram) {
        channels.push({
          integrationId: row.id,
          name: this.resolveInstagramChannelName(row),
          type: "instagram",
        });
      }
      for (const row of telegram) {
        channels.push({
          integrationId: row.id,
          name: this.resolveTelegramChannelName(row),
          type: "telegram",
        });
      }
      return channels;
    }

    const conversationGrants = permissions.integrationGrants.filter(
      (grant) =>
        grant.integrationType === "instagram" ||
        grant.integrationType === "telegram",
    );
    const { instagramById, telegramById } =
      await this.loadIntegrationMapsForGrants(workspaceId, conversationGrants);

    const channels: Array<{
      integrationId: number;
      name: string;
      type: "instagram" | "telegram";
    }> = [];
    const seen = new Set<string>();
    for (const grant of conversationGrants) {
      if (grant.integrationType === "instagram") {
        const row = instagramById.get(grant.integrationId);
        if (!row) {
          continue;
        }
        const key = `instagram:${row.id}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        channels.push({
          integrationId: row.id,
          name: this.resolveInstagramChannelName(row),
          type: "instagram",
        });
        continue;
      }
      const row = telegramById.get(grant.integrationId);
      if (!row) {
        continue;
      }
      const key = `telegram:${row.id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      channels.push({
        integrationId: row.id,
        name: this.resolveTelegramChannelName(row),
        type: "telegram",
      });
    }
    return channels;
  }

  private async validateOptionalChannelIds(
    workspaceId: number,
    permissions: Pick<
      ResolvedUserPermissions,
      "isOwner" | "conversations" | "integrationGrants"
    >,
    channelIds?: number[],
  ): Promise<number[] | undefined> {
    if (channelIds == null || channelIds.length === 0) {
      return undefined;
    }
    const accessible = await this.resolveAccessibleConversationChannels(
      workspaceId,
      permissions,
    );
    const accessibleIds = new Set(
      accessible.map((channel) => channel.integrationId),
    );
    const missing = channelIds.filter((id) => !accessibleIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown or inaccessible channel id(s): ${missing.join(", ")}`,
      );
    }
    return channelIds;
  }

  private async validateOptionalResponsibleUserIds(
    workspaceId: number,
    userId: number,
    permissions: Pick<
      ResolvedUserPermissions,
      "isOwner" | "conversations" | "integrationGrants"
    >,
    responsibleUserIds?: number[],
  ): Promise<number[] | undefined> {
    if (responsibleUserIds == null || responsibleUserIds.length === 0) {
      return undefined;
    }
    const accessible = await this.resolveAccessibleResponsibleUsers(
      workspaceId,
      userId,
      permissions,
    );
    const accessibleIds = new Set(accessible.map((user) => user.id));
    const missing = responsibleUserIds.filter((id) => !accessibleIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Unknown or inaccessible responsible user id(s): ${missing.join(", ")}`,
      );
    }
    return responsibleUserIds;
  }

  private async buildChannelFilter(
    workspaceId: number,
    permissions: Pick<
      ResolvedUserPermissions,
      "isOwner" | "conversations" | "integrationGrants"
    >,
    channelIds: number[],
  ): Promise<{
    instagram: InstagramIntegration[];
    telegram: TelegramIntegration[];
  }> {
    const accessible = await this.resolveAccessibleConversationChannels(
      workspaceId,
      permissions,
    );
    const instagramIds = [
      ...new Set(
        accessible
          .filter(
            (channel) =>
              channel.type === "instagram" &&
              channelIds.includes(channel.integrationId),
          )
          .map((channel) => channel.integrationId),
      ),
    ];
    const telegramIds = [
      ...new Set(
        accessible
          .filter(
            (channel) =>
              channel.type === "telegram" &&
              channelIds.includes(channel.integrationId),
          )
          .map((channel) => channel.integrationId),
      ),
    ];
    const [instagram, telegram] = await Promise.all([
      instagramIds.length > 0
        ? this.instagramIntegrationRepo.find({
            where: { workspaceId, id: In(instagramIds) },
          })
        : Promise.resolve([]),
      telegramIds.length > 0
        ? this.telegramIntegrationRepo.find({
            where: { workspaceId, id: In(telegramIds) },
          })
        : Promise.resolve([]),
    ]);
    return { instagram, telegram };
  }

  private buildLikePattern(keyword: string): string {
    const escaped = keyword.replace(/[%_\\]/g, (char) => `\\${char}`);
    return `%${escaped}%`;
  }

  private async resolveParticipantIdsByKeyword(
    workspaceId: number,
    keyword: string,
  ): Promise<string[]> {
    const trimmed = keyword.trim();
    if (!trimmed) {
      return [];
    }
    const pattern = this.buildLikePattern(trimmed);
    const likeParams = { pattern };

    const [instagramRows, telegramRows, clientLinkRows] = await Promise.all([
      this.instagramUserRepo
        .createQueryBuilder("u")
        .select("u.id", "id")
        .where("u.workspace_id = :workspaceId", { workspaceId })
        .andWhere(
          "(u.name ILIKE :pattern ESCAPE '\\' OR u.username ILIKE :pattern ESCAPE '\\')",
          likeParams,
        )
        .getRawMany<{ id: string }>(),
      this.telegramUserRepo
        .createQueryBuilder("u")
        .select("u.id", "id")
        .where("u.workspace_id = :workspaceId", { workspaceId })
        .andWhere(
          "(u.first_name ILIKE :pattern ESCAPE '\\' OR u.last_name ILIKE :pattern ESCAPE '\\' OR u.username ILIKE :pattern ESCAPE '\\' OR (u.first_name || ' ' || COALESCE(u.last_name, '')) ILIKE :pattern ESCAPE '\\')",
          likeParams,
        )
        .getRawMany<{ id: string }>(),
      this.clientLinkRepo
        .createQueryBuilder("cl")
        .innerJoin("cl.client", "client")
        .select("cl.external_id", "externalId")
        .where("cl.workspace_id = :workspaceId", { workspaceId })
        .andWhere(
          "(client.first_name ILIKE :pattern ESCAPE '\\' OR client.last_name ILIKE :pattern ESCAPE '\\' OR (client.first_name || ' ' || client.last_name) ILIKE :pattern ESCAPE '\\')",
          likeParams,
        )
        .getRawMany<{ externalId: string }>(),
    ]);

    const participantIds = new Set<string>();
    for (const row of instagramRows) {
      const id = row.id?.trim();
      if (id) {
        participantIds.add(id);
      }
    }
    for (const row of telegramRows) {
      const id = row.id?.trim();
      if (id) {
        participantIds.add(id);
      }
    }
    for (const row of clientLinkRows) {
      const id = row.externalId?.trim();
      if (id) {
        participantIds.add(id);
      }
    }
    return [...participantIds];
  }

  private applyParticipantIdsFilter(
    qb: SelectQueryBuilder<Conversation>,
    participantIds: string[],
  ): void {
    qb.andWhere("c.participant_id IN (:...participantIds)", { participantIds });
  }

  private applyChannelFilterToQuery(
    qb: SelectQueryBuilder<Conversation>,
    channelFilter: {
      instagram: InstagramIntegration[];
      telegram: TelegramIntegration[];
    },
  ): void {
    qb.andWhere(
      new Brackets((sub) => {
        let added = false;
        channelFilter.instagram.forEach((integration, index) => {
          const externalSourceIds = [
            integration.pageId,
            integration.instagramAccountId,
          ]
            .map((value) => value?.trim())
            .filter((value): value is string => Boolean(value));
          if (externalSourceIds.length === 0) {
            return;
          }
          const sourceParam = `channelInstagramSource${index}`;
          const externalParam = `channelInstagramExternal${index}`;
          sub.orWhere(
            `c.source = :${sourceParam} AND c.external_source_id IN (:...${externalParam})`,
            {
              [sourceParam]: ConversationSource.INSTAGRAM,
              [externalParam]: externalSourceIds,
            },
          );
          added = true;
        });
        channelFilter.telegram.forEach((integration, index) => {
          const sourceParam = `channelTelegramSource${index}`;
          const externalParam = `channelTelegramExternal${index}`;
          sub.orWhere(
            `c.source = :${sourceParam} AND c.external_source_id = :${externalParam}`,
            {
              [sourceParam]: ConversationSource.TELEGRAM,
              [externalParam]: String(integration.id),
            },
          );
          added = true;
        });
        if (!added) {
          sub.orWhere("1 = 0");
        }
      }),
    );
  }

  private resolveResponsibleUserDisplayName(user: User): string {
    const fullName = [user.firstName, user.lastName]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(" ");
    return fullName || user.email;
  }

  private async aggregateConversationsByResponsible(
    workspaceId: number,
    rows: Conversation[],
  ): Promise<{ total: number; items: ConversationGroupBucketItemDto[] }> {
    const counts = new Map<number | "unassigned", number>();
    for (const row of rows) {
      const key =
        row.responsibleMemberId == null
          ? "unassigned"
          : row.responsibleMemberId;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const memberIds = [...counts.keys()].filter(
      (key): key is number => typeof key === "number",
    );
    const members =
      memberIds.length > 0
        ? await this.workspaceMemberRepo.find({
            where: { workspaceId, id: In(memberIds) },
            relations: ["user"],
          })
        : [];
    const memberById = new Map(members.map((member) => [member.id, member]));

    const items: ConversationGroupBucketItemDto[] = [];
    for (const memberId of memberIds.sort((a, b) => a - b)) {
      const member = memberById.get(memberId);
      const label = member?.user
        ? this.resolveResponsibleUserDisplayName(member.user)
        : `Member #${memberId}`;
      items.push({
        key: String(memberId),
        label,
        count: counts.get(memberId) ?? 0,
        meta: { responsibleMemberId: memberId },
      });
    }

    items.push({
      key: "unassigned",
      label: "Без відповідального",
      count: counts.get("unassigned") ?? 0,
      meta: { responsibleMemberId: null },
    });

    return {
      total: rows.length,
      items,
    };
  }

  private async aggregateConversationsByStatus(
    workspaceId: number,
    rows: Conversation[],
  ): Promise<{ total: number; items: ConversationGroupBucketItemDto[] }> {
    const groups = await this.conversationGroupRepo.find({
      where: { workspaceId },
      order: { sortOrder: "ASC", id: "ASC" },
    });
    const nonSpamGroups = groups.filter(
      (group) => group.systemKey !== ConversationGroupSystemKey.SPAM,
    );

    const counts = new Map<number | "ungrouped", number>();
    for (const row of rows) {
      const key = row.groupId == null ? "ungrouped" : row.groupId;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const items: ConversationGroupBucketItemDto[] = nonSpamGroups.map(
      (group) => ({
        key: String(group.id),
        label: group.name,
        count: counts.get(group.id) ?? 0,
        meta: {
          groupId: group.id,
          systemKey: group.systemKey,
          color: group.color,
        },
      }),
    );

    items.push({
      key: "ungrouped",
      label: "Без статусу",
      count: counts.get("ungrouped") ?? 0,
      meta: { groupId: null, systemKey: null, color: null },
    });

    const total = items.reduce((sum, item) => sum + item.count, 0);
    return { total, items };
  }

  private aggregateConversationsByCreatedAt(rows: Conversation[]): {
    total: number;
    items: ConversationGroupBucketItemDto[];
  } {
    const counts = new Map<ConversationCreatedAtBucket, number>(
      CONVERSATION_CREATED_AT_BUCKETS.map((bucket) => [bucket, 0]),
    );
    const now = new Date();
    for (const row of rows) {
      const bucket = resolveConversationCreatedAtBucket(row.createdAt, now);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }

    return {
      total: rows.length,
      items: CONVERSATION_CREATED_AT_BUCKETS.map((bucket) => ({
        key: bucket,
        label: CONVERSATION_CREATED_AT_BUCKET_LABELS[bucket],
        count: counts.get(bucket) ?? 0,
        meta: { createdAtBucket: bucket },
      })),
    };
  }

  private async aggregateConversationsByChannel(
    workspaceId: number,
    permissions: Pick<
      ResolvedUserPermissions,
      "isOwner" | "conversations" | "integrationGrants"
    >,
    rows: Conversation[],
  ): Promise<{ total: number; items: ConversationGroupBucketItemDto[] }> {
    const channels = await this.resolveAccessibleConversationChannels(
      workspaceId,
      permissions,
    );
    const channelFilter = await this.buildChannelFilter(
      workspaceId,
      permissions,
      channels.map((channel) => channel.integrationId),
    );

    const counts = new Map<string, number>();
    for (const channel of channels) {
      counts.set(`${channel.type}:${channel.integrationId}`, 0);
    }

    for (const row of rows) {
      const matched = this.matchConversationChannel(row, channelFilter);
      if (matched == null) {
        continue;
      }
      const key = `${matched.type}:${matched.integrationId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const items: ConversationGroupBucketItemDto[] = channels.map((channel) => {
      const key = `${channel.type}:${channel.integrationId}`;
      return {
        key,
        label: channel.name,
        count: counts.get(key) ?? 0,
        meta: {
          channel: {
            integrationId: channel.integrationId,
            type: channel.type,
            name: channel.name,
          },
        },
      };
    });

    const total = items.reduce((sum, item) => sum + item.count, 0);
    return { total, items };
  }

  private matchConversationChannel(
    conversation: Conversation,
    channelFilter: {
      instagram: InstagramIntegration[];
      telegram: TelegramIntegration[];
    },
  ): {
    integrationId: number;
    type: "instagram" | "telegram";
    name: string;
  } | null {
    const externalSourceId = conversation.externalSourceId?.trim();
    if (!externalSourceId) {
      return null;
    }

    if (conversation.source === ConversationSource.TELEGRAM) {
      const integration = channelFilter.telegram.find(
        (row) => String(row.id) === externalSourceId,
      );
      if (!integration) {
        return null;
      }
      return {
        integrationId: integration.id,
        type: "telegram",
        name: this.resolveTelegramChannelName(integration),
      };
    }

    if (conversation.source === ConversationSource.INSTAGRAM) {
      const integration = channelFilter.instagram.find((row) => {
        const ids = [row.pageId, row.instagramAccountId]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value));
        return ids.includes(externalSourceId);
      });
      if (!integration) {
        return null;
      }
      return {
        integrationId: integration.id,
        type: "instagram",
        name: this.resolveInstagramChannelName(integration),
      };
    }

    return null;
  }

  private async resolveAccessibleResponsibleUsers(
    workspaceId: number,
    userId: number,
    permissions: Pick<
      ResolvedUserPermissions,
      "isOwner" | "conversations" | "integrationGrants"
    >,
  ): Promise<
    Array<{
      id: number;
      name: string;
      email: string;
      avatar: string | null;
    }>
  > {
    const memberIds =
      permissions.isOwner || permissions.conversations.fullAccess
        ? await this.findDistinctResponsibleMemberIdsForWorkspace(workspaceId)
        : await this.findDistinctResponsibleMemberIdsForIntegrationGrants(
            workspaceId,
            userId,
            permissions.integrationGrants,
          );
    if (memberIds.length === 0) {
      return [];
    }

    const members = await this.workspaceMemberRepo.find({
      where: { workspaceId, id: In(memberIds) },
      relations: ["user"],
      order: { id: "ASC" },
    });

    return members
      .filter((member) => member.user != null)
      .map((member) => ({
        id: member.id,
        name: this.resolveResponsibleUserDisplayName(member.user),
        email: member.user.email,
        avatar: member.user.avatarSrc ?? null,
      }));
  }

  private async findDistinctResponsibleMemberIdsForWorkspace(
    workspaceId: number,
  ): Promise<number[]> {
    const rows = await this.conversationRepo
      .createQueryBuilder("c")
      .select("DISTINCT c.responsible_member_id", "memberId")
      .where("c.workspace_id = :workspaceId", { workspaceId })
      .andWhere("c.responsible_member_id IS NOT NULL")
      .orderBy("c.responsible_member_id", "ASC")
      .getRawMany<{ memberId: string | number }>();

    return rows
      .map((row) => Number(row.memberId))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  private filterEffectiveIntegrationGrants(
    grants: ResolvedIntegrationGrant[],
    channelFilter?: {
      instagram: InstagramIntegration[];
      telegram: TelegramIntegration[];
    },
  ): ResolvedIntegrationGrant[] {
    const allowedInstagramIds =
      channelFilter != null
        ? new Set(channelFilter.instagram.map((row) => row.id))
        : null;
    const allowedTelegramIds =
      channelFilter != null
        ? new Set(channelFilter.telegram.map((row) => row.id))
        : null;

    return grants.filter((grant) => {
      if (allowedInstagramIds == null && allowedTelegramIds == null) {
        return true;
      }
      if (grant.integrationType === "instagram") {
        return allowedInstagramIds?.has(grant.integrationId) ?? false;
      }
      if (grant.integrationType === "telegram") {
        return allowedTelegramIds?.has(grant.integrationId) ?? false;
      }
      return false;
    });
  }

  private async prepareIntegrationGrantListContext(
    workspaceId: number,
    userId: number,
    grants: ResolvedIntegrationGrant[],
    channelFilter?: {
      instagram: InstagramIntegration[];
      telegram: TelegramIntegration[];
    },
  ): Promise<{
    effectiveGrants: ResolvedIntegrationGrant[];
    memberId: number | null;
    instagramById: Map<number, InstagramIntegration>;
    telegramById: Map<number, TelegramIntegration>;
  } | null> {
    if (grants.length === 0) {
      return null;
    }

    const effectiveGrants = this.filterEffectiveIntegrationGrants(
      grants,
      channelFilter,
    );
    if (effectiveGrants.length === 0) {
      return null;
    }

    const member = await this.workspaceMemberRepo.findOne({
      where: {
        workspaceId,
        userId,
        status: WorkspaceMemberStatus.ACTIVE,
      },
    });
    const memberId = member?.id ?? null;
    const { instagramById, telegramById } =
      await this.loadIntegrationMapsForGrants(workspaceId, effectiveGrants);

    return { effectiveGrants, memberId, instagramById, telegramById };
  }

  private applyIntegrationGrantAccessWhere(
    sub: WhereExpressionBuilder,
    grants: ResolvedIntegrationGrant[],
    memberId: number | null,
    instagramById: Map<number, InstagramIntegration>,
    telegramById: Map<number, TelegramIntegration>,
  ): void {
    let added = false;
    grants.forEach((grant, index) => {
      if (grant.integrationType === "instagram") {
        const integration = instagramById.get(grant.integrationId);
        if (!integration) {
          return;
        }
        const externalSourceIds = [
          integration.pageId,
          integration.instagramAccountId,
        ]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value));
        if (externalSourceIds.length === 0) {
          return;
        }
        if (grant.read === "mine" && memberId == null) {
          return;
        }
        const sourceParam = `instagramSource${index}`;
        const externalParam = `instagramExternalSourceIds${index}`;
        const memberParam = `memberId${index}`;
        if (grant.read === "all") {
          sub.orWhere(
            `c.source = :${sourceParam} AND c.external_source_id IN (:...${externalParam})`,
            {
              [sourceParam]: ConversationSource.INSTAGRAM,
              [externalParam]: externalSourceIds,
            },
          );
        } else {
          sub.orWhere(
            `c.source = :${sourceParam} AND c.external_source_id IN (:...${externalParam}) AND c.responsible_member_id = :${memberParam}`,
            {
              [sourceParam]: ConversationSource.INSTAGRAM,
              [externalParam]: externalSourceIds,
              [memberParam]: memberId,
            },
          );
          if (grant.canTakeChat && grant.write === "mine" && memberId != null) {
            sub.orWhere(
              `c.source = :${sourceParam} AND c.external_source_id IN (:...${externalParam}) AND c.responsible_member_id IS NULL`,
              {
                [sourceParam]: ConversationSource.INSTAGRAM,
                [externalParam]: externalSourceIds,
              },
            );
          }
        }
        added = true;
        return;
      }

      if (grant.integrationType === "telegram") {
        const integration = telegramById.get(grant.integrationId);
        if (!integration) {
          return;
        }
        if (grant.read === "mine" && memberId == null) {
          return;
        }
        const sourceParam = `telegramSource${index}`;
        const externalParam = `telegramExternalSourceId${index}`;
        const memberParam = `memberId${index}`;
        if (grant.read === "all") {
          sub.orWhere(
            `c.source = :${sourceParam} AND c.external_source_id = :${externalParam}`,
            {
              [sourceParam]: ConversationSource.TELEGRAM,
              [externalParam]: String(integration.id),
            },
          );
        } else {
          sub.orWhere(
            `c.source = :${sourceParam} AND c.external_source_id = :${externalParam} AND c.responsible_member_id = :${memberParam}`,
            {
              [sourceParam]: ConversationSource.TELEGRAM,
              [externalParam]: String(integration.id),
              [memberParam]: memberId,
            },
          );
          if (grant.canTakeChat && grant.write === "mine" && memberId != null) {
            sub.orWhere(
              `c.source = :${sourceParam} AND c.external_source_id = :${externalParam} AND c.responsible_member_id IS NULL`,
              {
                [sourceParam]: ConversationSource.TELEGRAM,
                [externalParam]: String(integration.id),
              },
            );
          }
        }
        added = true;
      }
    });
    if (!added) {
      sub.orWhere("1 = 0");
    }
  }

  private applyIntegrationScopeWhere(
    sub: WhereExpressionBuilder,
    grants: ResolvedIntegrationGrant[],
    instagramById: Map<number, InstagramIntegration>,
    telegramById: Map<number, TelegramIntegration>,
    paramPrefix = "scope",
  ): void {
    let added = false;
    grants.forEach((grant, index) => {
      if (grant.integrationType === "instagram") {
        const integration = instagramById.get(grant.integrationId);
        if (!integration) {
          return;
        }
        const externalSourceIds = [
          integration.pageId,
          integration.instagramAccountId,
        ]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value));
        if (externalSourceIds.length === 0) {
          return;
        }
        const sourceParam = `${paramPrefix}InstagramSource${index}`;
        const externalParam = `${paramPrefix}InstagramExternal${index}`;
        sub.orWhere(
          `c.source = :${sourceParam} AND c.external_source_id IN (:...${externalParam})`,
          {
            [sourceParam]: ConversationSource.INSTAGRAM,
            [externalParam]: externalSourceIds,
          },
        );
        added = true;
        return;
      }

      if (grant.integrationType === "telegram") {
        const integration = telegramById.get(grant.integrationId);
        if (!integration) {
          return;
        }
        const sourceParam = `${paramPrefix}TelegramSource${index}`;
        const externalParam = `${paramPrefix}TelegramExternal${index}`;
        sub.orWhere(
          `c.source = :${sourceParam} AND c.external_source_id = :${externalParam}`,
          {
            [sourceParam]: ConversationSource.TELEGRAM,
            [externalParam]: String(integration.id),
          },
        );
        added = true;
      }
    });
    if (!added) {
      sub.orWhere("1 = 0");
    }
  }

  private filterIntegrationGrantsWithAssignResponsibility(
    grants: ResolvedIntegrationGrant[],
  ): ResolvedIntegrationGrant[] {
    return grants.filter(
      (grant) =>
        grant.assignResponsibility &&
        (grant.integrationType === "instagram" ||
          grant.integrationType === "telegram"),
    );
  }

  private async findDistinctResponsibleMemberIdsForIntegrationGrants(
    workspaceId: number,
    _userId: number,
    grants: ResolvedIntegrationGrant[],
  ): Promise<number[]> {
    const assignGrants =
      this.filterIntegrationGrantsWithAssignResponsibility(grants);
    if (assignGrants.length === 0) {
      return [];
    }

    const { instagramById, telegramById } =
      await this.loadIntegrationMapsForGrants(workspaceId, assignGrants);

    const rows = await this.conversationRepo
      .createQueryBuilder("c")
      .select("DISTINCT c.responsible_member_id", "memberId")
      .where("c.workspace_id = :workspaceId", { workspaceId })
      .andWhere("c.responsible_member_id IS NOT NULL")
      .andWhere(
        new Brackets((sub) => {
          this.applyIntegrationScopeWhere(
            sub,
            assignGrants,
            instagramById,
            telegramById,
            "assign",
          );
        }),
      )
      .orderBy("c.responsible_member_id", "ASC")
      .getRawMany<{ memberId: string | number }>();

    return rows
      .map((row) => Number(row.memberId))
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  private mapConversationDistributionRows(
    rows: Array<{ groupId: string | null; count: string }>,
    hiddenGroupIds: Set<number> = new Set(),
  ): { byGroupId: Map<number, number>; total: number } {
    let total = 0;
    const byGroupId = new Map<number, number>();
    for (const row of rows) {
      const count = Number(row.count);
      if (!Number.isFinite(count) || count < 0) {
        continue;
      }
      if (row.groupId != null && row.groupId !== "") {
        const groupId = Number(row.groupId);
        byGroupId.set(groupId, count);
        if (!hiddenGroupIds.has(groupId)) {
          total += count;
        }
      } else {
        total += count;
      }
    }
    return { byGroupId, total };
  }

  private countConversationsByGroupQuery(
    workspaceId: number,
  ): Promise<Array<{ groupId: string | null; count: string }>> {
    return this.conversationRepo
      .createQueryBuilder("c")
      .select("c.group_id", "groupId")
      .addSelect("COUNT(*)::int", "count")
      .where("c.workspace_id = :workspaceId", { workspaceId })
      .groupBy("c.group_id")
      .getRawMany();
  }

  private async findConversationsForWorkspace(
    workspaceId: number,
    groupFilter: {
      includeGroupIds?: number[];
      excludeGroupIds?: number[];
      onlyUngrouped?: boolean;
    } = {},
    showWithoutResponsibleOnly?: boolean,
    channelFilter?: {
      instagram: InstagramIntegration[];
      telegram: TelegramIntegration[];
    },
    responsibleMemberIds?: number[],
    participantIds?: string[],
    createdAtBucket?: ConversationCreatedAtBucket,
  ): Promise<Conversation[]> {
    const useQueryBuilder =
      channelFilter != null ||
      (responsibleMemberIds != null && responsibleMemberIds.length > 0) ||
      (participantIds != null && participantIds.length > 0) ||
      (groupFilter.excludeGroupIds != null &&
        groupFilter.excludeGroupIds.length > 0) ||
      groupFilter.onlyUngrouped === true ||
      createdAtBucket != null;

    if (!useQueryBuilder) {
      const where: FindOptionsWhere<Conversation> =
        groupFilter.includeGroupIds != null &&
        groupFilter.includeGroupIds.length > 0
          ? { workspaceId, groupId: In(groupFilter.includeGroupIds) }
          : { workspaceId };
      if (showWithoutResponsibleOnly) {
        where.responsibleMemberId = IsNull();
      }
      return this.conversationRepo.find({
        where,
        order: { instUpdatedAt: "DESC" },
      });
    }

    const qb = this.conversationRepo
      .createQueryBuilder("c")
      .where("c.workspace_id = :workspaceId", { workspaceId });
    this.applyConversationGroupListFilter(qb, groupFilter);
    if (showWithoutResponsibleOnly) {
      qb.andWhere("c.responsible_member_id IS NULL");
    }
    if (responsibleMemberIds != null && responsibleMemberIds.length > 0) {
      qb.andWhere("c.responsible_member_id IN (:...responsibleMemberIds)", {
        responsibleMemberIds,
      });
    }
    if (participantIds != null && participantIds.length > 0) {
      this.applyParticipantIdsFilter(qb, participantIds);
    }
    if (channelFilter != null) {
      this.applyChannelFilterToQuery(qb, channelFilter);
    }
    if (createdAtBucket != null) {
      applyCreatedAtBucketToQuery(qb, createdAtBucket);
    }
    qb.orderBy("c.inst_updated_at", "DESC");
    return qb.getMany();
  }

  private async loadIntegrationMapsForGrants(
    workspaceId: number,
    grants: ResolvedIntegrationGrant[],
  ): Promise<{
    instagramById: Map<number, InstagramIntegration>;
    telegramById: Map<number, TelegramIntegration>;
  }> {
    const instagramIds = grants
      .filter((grant) => grant.integrationType === "instagram")
      .map((grant) => grant.integrationId);
    const telegramIds = grants
      .filter((grant) => grant.integrationType === "telegram")
      .map((grant) => grant.integrationId);

    const instagramById = new Map(
      (instagramIds.length > 0
        ? await this.instagramIntegrationRepo.find({
            where: { workspaceId, id: In(instagramIds) },
          })
        : []
      ).map((row) => [row.id, row]),
    );
    const telegramById = new Map(
      (telegramIds.length > 0
        ? await this.telegramIntegrationRepo.find({
            where: { workspaceId, id: In(telegramIds) },
          })
        : []
      ).map((row) => [row.id, row]),
    );

    return { instagramById, telegramById };
  }

  private conversationBelongsToGrant(
    conversation: Conversation,
    grant: ResolvedIntegrationGrant,
    instagramById: Map<number, InstagramIntegration>,
    telegramById: Map<number, TelegramIntegration>,
  ): boolean {
    const externalSourceId = conversation.externalSourceId?.trim();
    if (!externalSourceId) {
      return false;
    }

    if (grant.integrationType === "telegram") {
      const integration = telegramById.get(grant.integrationId);
      if (!integration) {
        return false;
      }
      return (
        conversation.source === ConversationSource.TELEGRAM &&
        externalSourceId === String(integration.id)
      );
    }

    if (grant.integrationType !== "instagram") {
      return false;
    }

    const integration = instagramById.get(grant.integrationId);
    if (!integration) {
      return false;
    }
    const integrationExternalIds = [
      integration.pageId,
      integration.instagramAccountId,
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));

    return (
      conversation.source === ConversationSource.INSTAGRAM &&
      integrationExternalIds.includes(externalSourceId)
    );
  }

  private async isConversationReadableByGrants(
    conversation: Conversation,
    workspaceId: number,
    userId: number,
    grants: ResolvedIntegrationGrant[],
  ): Promise<boolean> {
    if (grants.length === 0) {
      return false;
    }

    const member = await this.workspaceMemberRepo.findOne({
      where: {
        workspaceId,
        userId,
        status: WorkspaceMemberStatus.ACTIVE,
      },
    });
    const memberId = member?.id ?? null;
    const { instagramById, telegramById } =
      await this.loadIntegrationMapsForGrants(workspaceId, grants);

    for (const grant of grants) {
      if (
        !this.conversationBelongsToGrant(
          conversation,
          grant,
          instagramById,
          telegramById,
        )
      ) {
        continue;
      }
      if (this.grantAllowsConversationMessages(conversation, grant, memberId)) {
        return true;
      }
    }

    return false;
  }

  private async loadConversationInWorkspace(
    workspaceId: number,
    conversationIdParam: string,
  ): Promise<Conversation | null> {
    const trimmed = conversationIdParam.trim();
    if (!trimmed) {
      return null;
    }
    if (/^\d+$/.test(trimmed)) {
      const byId = await this.conversationRepo.findOne({
        where: { workspaceId, id: Number(trimmed) },
      });
      if (byId) {
        return byId;
      }
    }
    return this.conversationRepo.findOne({
      where: { workspaceId, externalId: trimmed },
    });
  }

  private async requireReadableConversation(
    userId: number,
    conversationIdParam: string,
    context: { sessionWorkspaceId: number; appRole?: string },
  ): Promise<Conversation> {
    const workspaceId = await this.resolveWorkspaceIdForConversationList(
      userId,
      context.sessionWorkspaceId,
    );
    const conversation = await this.loadConversationInWorkspace(
      workspaceId,
      conversationIdParam,
    );
    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    const permissions = await this.workspacePermissions.getResolvedForUser(
      userId,
      context.appRole,
      workspaceId,
    );
    if (permissions.isOwner || permissions.conversations.fullAccess) {
      return conversation;
    }

    const allowed = await this.isConversationReadableByGrants(
      conversation,
      workspaceId,
      userId,
      permissions.integrationGrants,
    );
    if (!allowed) {
      throw new NotFoundException("Conversation not found");
    }

    return conversation;
  }

  private async findConversationsForIntegrationGrants(
    workspaceId: number,
    userId: number,
    grants: ResolvedIntegrationGrant[],
    groupFilter: {
      includeGroupIds?: number[];
      excludeGroupIds?: number[];
      onlyUngrouped?: boolean;
    } = {},
    showWithoutResponsibleOnly?: boolean,
    channelFilter?: {
      instagram: InstagramIntegration[];
      telegram: TelegramIntegration[];
    },
    responsibleMemberIds?: number[],
    participantIds?: string[],
    createdAtBucket?: ConversationCreatedAtBucket,
  ): Promise<Conversation[]> {
    const context = await this.prepareIntegrationGrantListContext(
      workspaceId,
      userId,
      grants,
      channelFilter,
    );
    if (context == null) {
      return [];
    }

    const qb = this.conversationRepo
      .createQueryBuilder("c")
      .where("c.workspace_id = :workspaceId", { workspaceId });

    this.applyConversationGroupListFilter(qb, groupFilter);

    if (showWithoutResponsibleOnly) {
      qb.andWhere("c.responsible_member_id IS NULL");
    }

    if (responsibleMemberIds != null && responsibleMemberIds.length > 0) {
      qb.andWhere("c.responsible_member_id IN (:...responsibleMemberIds)", {
        responsibleMemberIds,
      });
    }

    if (participantIds != null && participantIds.length > 0) {
      this.applyParticipantIdsFilter(qb, participantIds);
    }

    if (channelFilter != null) {
      this.applyChannelFilterToQuery(qb, channelFilter);
    }

    if (createdAtBucket != null) {
      applyCreatedAtBucketToQuery(qb, createdAtBucket);
    }

    qb.andWhere(
      new Brackets((sub) => {
        this.applyIntegrationGrantAccessWhere(
          sub,
          context.effectiveGrants,
          context.memberId,
          context.instagramById,
          context.telegramById,
        );
      }),
    );

    qb.orderBy("c.inst_updated_at", "DESC");
    return qb.getMany();
  }

  private async resolveWorkspaceIdForConversationList(
    ownerId: number,
    sessionWorkspaceId: number,
  ): Promise<number> {
    const workspace = await this.workspaceContext.requireWorkspaceOwner(
      ownerId,
      sessionWorkspaceId,
    );
    return workspace.id;
  }

  private async buildMyAccountIdsForWorkspace(
    workspaceId: number,
    company: InstagramIntegration | null,
    conversation?: Conversation,
  ): Promise<Set<string>> {
    const ids = company ? this.buildMyInstagramIds(company) : new Set<string>();
    const integrations = await this.telegramIntegrationRepo.find({
      where: { workspaceId, status: TelegramIntegrationStatus.ACTIVE },
    });
    for (const row of integrations) {
      const telegramUserId = row.telegramUserId?.trim();
      if (telegramUserId) {
        ids.add(telegramUserId);
      }
    }
    if (
      conversation?.source === ConversationSource.TELEGRAM &&
      conversation.externalSourceId
    ) {
      const integrationId = Number.parseInt(
        conversation.externalSourceId.trim(),
        10,
      );
      if (Number.isInteger(integrationId) && integrationId > 0) {
        const linked = integrations.find((i) => i.id === integrationId);
        const linkedUserId = linked?.telegramUserId?.trim();
        if (linkedUserId) {
          ids.add(linkedUserId);
        }
      }
    }
    return ids;
  }

  private async buildMyAccountIds(
    ownerId: number,
    company: InstagramIntegration,
    conversation?: Conversation,
  ): Promise<Set<string>> {
    return this.buildMyAccountIdsForWorkspace(
      company.workspaceId,
      company,
      conversation,
    );
  }

  private toConversationParticipantDto(
    row: Conversation,
    instagramById: Map<string, InstagramUser>,
    telegramById: Map<string, TelegramUser>,
  ): ConversationParticipantDto | null {
    const participantKey = row.participantId?.trim();
    if (!participantKey || participantKey === "unknown") return null;

    if (this.isTelegramConversation(row)) {
      const participant = telegramById.get(participantKey);
      if (!participant) return null;
      return {
        id: participant.id,
        name: TelegramUsersService.buildDisplayName(participant),
        username: participant.username?.trim() || "",
        profilePic: participant.profilePic,
        phone: participant.phone?.trim() || "",
      };
    }

    const participant = instagramById.get(participantKey);
    if (!participant) return null;
    return {
      id: participant.id,
      name: participant.name,
      username: participant.username,
      profilePic: participant.profilePic,
      phone: "",
    };
  }

  private isTelegramConversation(row: Conversation): boolean {
    return (
      row.source === ConversationSource.TELEGRAM ||
      row.externalId.trim().startsWith("telegram:")
    );
  }

  private async getParticipantMapsForRows(
    rows: Conversation[],
    options?: { maxTelegramSync?: number },
  ): Promise<{
    instagramById: Map<string, InstagramUser>;
    telegramById: Map<string, TelegramUser>;
  }> {
    if (rows.length === 0) {
      return { instagramById: new Map(), telegramById: new Map() };
    }
    const workspaceId = rows[0].workspaceId;
    const instagramIds: string[] = [];
    const telegramIds: string[] = [];
    for (const row of rows) {
      const id = row.participantId?.trim();
      if (!id || id === "unknown") continue;
      if (this.isTelegramConversation(row)) {
        telegramIds.push(id);
      } else {
        instagramIds.push(id);
      }
    }
    const [instagramById, telegramById] = await Promise.all([
      this.getInstagramUsersByIds(workspaceId, instagramIds),
      this.getTelegramUsersByIds(workspaceId, telegramIds),
    ]);

    const missingTelegramRows = rows.filter((row) => {
      const participantId = row.participantId?.trim();
      return (
        this.isTelegramConversation(row) &&
        !!participantId &&
        participantId !== "unknown" &&
        !telegramById.has(participantId)
      );
    });
    if (missingTelegramRows.length === 0) {
      return { instagramById, telegramById };
    }

    const maxSync = options?.maxTelegramSync ?? 0;
    if (maxSync <= 0) {
      return { instagramById, telegramById };
    }

    const toSync = missingTelegramRows.slice(0, maxSync);
    try {
      await this.telegramUsers.syncMissingParticipantsForConversations(toSync);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(`telegram_users sync on GET failed: ${err}`);
    }

    const refreshed = await this.getTelegramUsersByIds(
      workspaceId,
      toSync.map((row) => row.participantId),
    );
    for (const [id, user] of refreshed) {
      telegramById.set(id, user);
    }

    return { instagramById, telegramById };
  }

  private async getInstagramUsersByIds(
    workspaceId: number,
    ids: string[],
  ): Promise<Map<string, InstagramUser>> {
    const uniqIds = [...new Set(ids.map((id) => id?.trim()).filter(Boolean))];
    if (uniqIds.length === 0) return new Map();
    const users = await this.instagramUserRepo.find({
      where: { workspaceId, id: In(uniqIds) },
    });
    return new Map(users.map((u) => [u.id, u]));
  }

  private async getTelegramUsersByIds(
    workspaceId: number,
    ids: string[],
  ): Promise<Map<string, TelegramUser>> {
    const uniqIds = [...new Set(ids.map((id) => id?.trim()).filter(Boolean))];
    if (uniqIds.length === 0) return new Map();
    const users = await this.telegramUserRepo.find({
      where: { workspaceId, id: In(uniqIds) },
    });
    return new Map(users.map((u) => [u.id, u]));
  }

  private async getLastMessageByConversationIds(
    conversationIds: number[],
  ): Promise<Map<number, ConversationMessage>> {
    const uniqIds = [...new Set(conversationIds)];
    if (uniqIds.length === 0) return new Map();

    const rows = await this.conversationMessageRepo
      .createQueryBuilder("m")
      .where("m.conversation_id IN (:...conversationIds)", {
        conversationIds: uniqIds,
      })
      .orderBy("m.conversation_id", "ASC")
      .addOrderBy("m.created_at", "DESC")
      .addOrderBy("m.external_id", "DESC")
      .getMany();

    const out = new Map<number, ConversationMessage>();
    for (const m of rows) {
      if (!out.has(m.conversationId)) {
        out.set(m.conversationId, m);
      }
    }
    return out;
  }

  private async requireConversationInWorkspace(
    userId: number,
    find: { id?: number; externalId?: string },
    workspaceIdParam?: number,
  ): Promise<Conversation> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      userId,
      undefined,
      workspaceIdParam,
    );
    const where: FindOptionsWhere<Conversation> = {
      workspaceId: workspace.id,
    };
    if (find.id != null) {
      where.id = find.id;
    }
    if (find.externalId != null) {
      where.externalId = find.externalId;
    }
    const row = await this.conversationRepo.findOne({ where });
    if (!row) {
      throw new NotFoundException("Conversation not found");
    }
    return row;
  }

  /**
   * Path `conversationId`: numeric = DB primary key, otherwise stored Instagram `external_id`.
   */
  private async requireConversationForOwnerFromParam(
    ownerId: number,
    conversationIdParam: string,
  ): Promise<Conversation> {
    const trimmed = conversationIdParam.trim();
    if (!trimmed) {
      throw new BadRequestException("conversationId must not be empty");
    }
    if (/^\d+$/.test(trimmed)) {
      const id = Number(trimmed);
      try {
        return await this.requireConversationInWorkspace(ownerId, { id });
      } catch (e) {
        if (!(e instanceof NotFoundException)) {
          throw e;
        }
      }
    }
    return this.requireConversationInWorkspace(ownerId, {
      externalId: trimmed,
    });
  }

  private buildConversationMessagesGraphUrl(
    graphConversationId: string,
    accessToken: string,
    sinceUnixSeconds?: number,
  ): URL {
    const url = new URL(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(graphConversationId)}/messages`,
    );
    url.searchParams.set(
      "fields",
      [
        "id",
        "created_time",
        "message",
        "is_unsupported",
        "from{id,name,email,username}",
        "to{data{id,name,email,username}}",
        `attachments{${INSTAGRAM_GRAPH_MESSAGE_ATTACHMENTS_FIELDS}}`,
        "reactions{data{reaction,emoji,users{id,username}}}",
      ].join(","),
    );
    url.searchParams.set("access_token", accessToken);
    if (sinceUnixSeconds != null && Number.isFinite(sinceUnixSeconds)) {
      url.searchParams.set("since", String(Math.floor(sinceUnixSeconds)));
    }
    return url;
  }

  /**
   * Walks `paging.next` up to `maxPages`, keeps messages with `created_time >= since`, deduped by id.
   * Graph often ignores the `since` query param on this edge; client-side filtering is reliable.
   */
  private async getInstagramMessagesSince(
    graphConversationId: string,
    accessToken: string,
    since: Date,
    maxPages = 25,
  ): Promise<InstagramMessagesResponseDto> {
    const sinceMs = since.getTime();
    const firstUrl = this.buildConversationMessagesGraphUrl(
      graphConversationId,
      accessToken,
      Math.floor(sinceMs / 1000),
    );

    const byId = new Map<string, InstagramMessageDto>();
    let nextUrl: string | null = firstUrl.toString();
    let pages = 0;

    while (nextUrl && pages < maxPages) {
      const page: InstagramMessagesResponseDto =
        await this.instagramGraphFetch<InstagramMessagesResponseDto>(
          new URL(nextUrl),
        );
      pages++;
      const batch = page.data ?? [];
      for (const m of batch) {
        const t = new Date(m.created_time).getTime();
        if (!Number.isNaN(t) && t >= sinceMs && m.id) {
          byId.set(m.id, m);
        }
      }
      nextUrl = page.paging?.next ?? null;
    }

    const merged = [...byId.values()].sort(
      (a, b) =>
        new Date(a.created_time).getTime() - new Date(b.created_time).getTime(),
    );

    return { data: merged };
  }

  private async persistInstagramMessages(
    conversationDbId: number,
    messages: InstagramMessageDto[],
    options?: { editedAt?: Date; ownerId: number },
  ): Promise<void> {
    for (const m of messages) {
      const ext = m.id?.trim();
      if (!ext) continue;
      const createdAt = new Date(m.created_time);
      if (Number.isNaN(createdAt.getTime())) continue;
      const senderId = m.from?.id?.trim() ?? "";
      const receiverId = m.to?.data?.[0]?.id?.trim() ?? "";
      const text = m.message ?? "";
      const { id, ...messageWithoutId } = m;
      void id;

      let row = await this.conversationMessageRepo.findOne({
        where: { conversationId: conversationDbId, externalId: ext },
      });
      const payloadForJson = row
        ? mergeMessageJsonPreservingReactions(
            row.instagramJson,
            messageWithoutId as Record<string, unknown>,
          )
        : (messageWithoutId as Record<string, unknown>);
      const instagramJson = JSON.stringify(payloadForJson);

      if (!row) {
        row = this.conversationMessageRepo.create({
          conversationId: conversationDbId,
          externalId: ext,
          message: text,
          instagramJson,
          createdAt,
          senderId: senderId.length > 0 ? senderId : "0",
          receiverId: receiverId.length > 0 ? receiverId : "0",
          readAt: null,
          repliedToExternalId: null,
          ...(options?.editedAt != null ? { editedAt: options.editedAt } : {}),
        });
      } else {
        row.message = text;
        row.instagramJson = instagramJson;
        row.createdAt = createdAt;
        row.senderId = senderId.length > 0 ? senderId : row.senderId;
        row.receiverId = receiverId.length > 0 ? receiverId : row.receiverId;
        if (options?.editedAt != null) {
          row.editedAt = options.editedAt;
        }
      }
      const saved = await this.conversationMessageRepo.save(row);
      if (options?.ownerId != null) {
        await this.messageNotify.notifyPersistedMessage(saved, options.ownerId);
      }
    }
  }

  private async getConversationMessagesFromDb(
    conversationDbId: number,
    paging?: { page: number; pageSize: number },
  ): Promise<InstagramMessagesResponseDto> {
    const qb = this.conversationMessageRepo
      .createQueryBuilder("m")
      .where("m.conversation_id = :cid", { cid: conversationDbId })
      .orderBy("m.created_at", "DESC")
      .addOrderBy("m.external_id", "DESC");
    const page = paging?.page ?? 1;
    const pageSize = paging?.pageSize ?? 50;
    const total = await qb.getCount();
    const rows = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const messageRowsByExternalId = new Map(rows.map((r) => [r.externalId, r]));
    const parentIds = [
      ...new Set(
        rows
          .map((r) => r.repliedToExternalId?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const missingParentIds = parentIds.filter(
      (id) => !messageRowsByExternalId.has(id),
    );
    if (missingParentIds.length > 0) {
      const extraParents = await this.conversationMessageRepo.find({
        where: {
          conversationId: conversationDbId,
          externalId: In(missingParentIds),
        },
      });
      for (const p of extraParents) {
        messageRowsByExternalId.set(p.externalId, p);
      }
    }

    const data: InstagramMessageDto[] = rows.map((r) => {
      const parentId = r.repliedToExternalId?.trim();
      const parent = parentId
        ? messageRowsByExternalId.get(parentId)
        : undefined;
      return this.messagePresenter.mapRowToDto(r, parent);
    });
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    return {
      data,
      paging: {
        page,
        page_size: pageSize,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_previous: totalPages > 0 && page > 1,
      },
    };
  }

  async getInstagramMessagesForConversation(
    ownerId: number,
    conversationId: string,
    options: {
      page?: number;
      pageSize?: number;
      sessionWorkspaceId: number;
      appRole?: string;
    },
  ): Promise<InstagramMessagesResponseDto> {
    const conv = await this.requireReadableConversation(
      ownerId,
      conversationId,
      {
        sessionWorkspaceId: options.sessionWorkspaceId,
        appRole: options.appRole,
      },
    );
    const result = await this.getConversationMessagesFromDb(conv.id, {
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 50,
    });
    return result;
  }

  /**
   * Live fetch from Meta Graph `GET /{conversation-id}/messages` for an Instagram thread.
   * Uses `conversations.external_id` as the Graph conversation id.
   */
  async getInstagramGraphMessagesForConversation(
    ownerId: number,
    conversationIdParam: string,
    query: ListInstagramGraphMessagesQueryDto = {},
  ): Promise<InstagramGraphMessagesResponseDto> {
    const conv = await this.requireConversationForOwnerFromParam(
      ownerId,
      conversationIdParam,
    );
    if (conv.source !== ConversationSource.INSTAGRAM) {
      throw new BadRequestException(
        "Graph messages are only available for Instagram conversations",
      );
    }

    const graphConversationId = conv.externalId?.trim();
    if (!graphConversationId) {
      throw new BadRequestException(
        "Conversation has no Instagram Graph conversation id (external_id)",
      );
    }

    const integration =
      await this.workspaceContext.requireInstagramIntegrationForOwner(ownerId);
    const accessToken = integration.accessToken?.trim();
    if (!accessToken) {
      throw new ServiceUnavailableException(
        "No Page Graph token: complete Facebook Login so integration.access_token is set.",
      );
    }

    const url = new URL(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(graphConversationId)}/messages`,
    );
    url.searchParams.set(
      "fields",
      INSTAGRAM_GRAPH_CONVERSATION_MESSAGES_FIELDS,
    );
    url.searchParams.set("limit", String(query.limit ?? 25));
    url.searchParams.set("access_token", accessToken);
    if (query.after?.trim()) {
      url.searchParams.set("after", query.after.trim());
    }
    if (query.before?.trim()) {
      url.searchParams.set("before", query.before.trim());
    }

    return this.instagramGraphFetch<InstagramGraphMessagesResponseDto>(url);
  }

  private normalizeRecipientIdInput(raw: string | undefined | null): string {
    if (raw == null) return "";
    return String(raw)
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/[\s\u00a0\u200b-\u200d\ufeff,]+/g, "");
  }

  private isLikelyInstagramPsid(id: string | undefined): boolean {
    const t = this.normalizeRecipientIdInput(id ?? "");
    return t.length > 0 && t !== "unknown" && /^\d+$/.test(t);
  }

  /**
   * Sends a message in the conversation thread (Instagram or Telegram).
   * @param replyToId Instagram Graph `mid` or Telegram `tg:{chatId}:{messageId}` from GET .../messages.
   */
  async sendMessageForConversation(
    ownerId: number,
    conversationIdParam: string,
    message: string,
    replyToId?: string,
    file?: { buffer: Buffer; mimetype?: string; originalname?: string },
    mediaType?: OutboundConversationMessageMediaType,
  ): Promise<SendInstagramMessageResponseDto> {
    const conv = await this.requireConversationForOwnerFromParam(
      ownerId,
      conversationIdParam,
    );
    await this.assertCanWriteConversation(ownerId, conv);

    const hasFile = file != null && file.buffer.length > 0;
    if (hasFile && !mediaType) {
      throw new BadRequestException(
        "type is required when sending a file (image, video, or audio)",
      );
    }

    if (conv.source === ConversationSource.TELEGRAM) {
      return this.telegramMessaging.sendMessageForConversation(
        ownerId,
        conv,
        message,
        replyToId,
        file,
        mediaType,
      );
    }
    return this.sendInstagramMessageForConversation(
      ownerId,
      conv,
      message,
      replyToId,
      file,
      mediaType,
    );
  }

  /**
   * @param replyToMid When unset: plain text message. When set: Graph `message.reply_to.mid` (reply).
   */
  async sendInstagramMessageForConversation(
    ownerId: number,
    convOrParam: Conversation | string,
    message: string,
    replyToMid?: string,
    file?: { buffer: Buffer; mimetype?: string; originalname?: string },
    mediaType?: OutboundConversationMessageMediaType,
  ): Promise<SendInstagramMessageResponseDto> {
    const integration =
      await this.workspaceContext.requireInstagramIntegrationForOwner(ownerId);
    const accessToken = integration.accessToken?.trim();
    if (!accessToken) {
      throw new ServiceUnavailableException(
        "No Page Graph token: complete Facebook Login so integration.access_token is set.",
      );
    }
    const conv =
      typeof convOrParam === "string"
        ? await this.requireConversationForOwnerFromParam(ownerId, convOrParam)
        : convOrParam;
    if (conv.source !== ConversationSource.INSTAGRAM) {
      throw new BadRequestException("Conversation is not an Instagram thread");
    }

    const recipient = conv.participantId?.trim() ?? "";
    if (!this.isLikelyInstagramPsid(recipient)) {
      throw new BadRequestException(
        "Conversation has no valid participant_id (recipient PSID). Run POST /conversations/sync so the thread is stored with a participant, or open the conversation in Instagram first.",
      );
    }

    const hasFile = file != null && file.buffer.length > 0;
    const caption = message.trim();
    if (!hasFile && caption.length === 0) {
      throw new BadRequestException("message or file is required");
    }
    if (hasFile && !mediaType) {
      throw new BadRequestException(
        "type is required when sending a file (image, video, or audio)",
      );
    }

    const replyMid = replyToMid?.trim();
    if (replyMid) {
      const parentExists = await this.conversationMessageRepo.exist({
        where: { conversationId: conv.id, externalId: replyMid },
      });
      if (!parentExists) {
        throw new BadRequestException(
          "reply_to_id must be the id of a message in this conversation (from GET .../messages).",
        );
      }
    }

    const sendMode = await this.resolveInstagramMessagingSendMode(conv);
    const senderId =
      integration.instagramAccountId?.trim() ||
      conv.externalSourceId?.trim() ||
      "0";

    if (hasFile && mediaType) {
      const attachmentId = await this.uploadInstagramMessageAttachment(
        accessToken,
        file,
        mediaType,
      );

      const mediaResult = await this.sendInstagramGraphMessage(accessToken, {
        recipient,
        sendMode,
        replyMid,
        message: {
          attachment: {
            type: mediaType,
            payload: { attachment_id: attachmentId },
          },
        },
      });

      const messageId = mediaResult.message_id?.trim();
      if (messageId) {
        const messageDate = new Date();
        const storedAttachments = await this.archiveInstagramOutboundFile(
          file,
          mediaType,
          {
            conversationId: conv.id,
            messageExternalId: messageId,
            messageAt: messageDate,
          },
        );
        const messageType = this.resolveInstagramOutboundMessageType(
          mediaType,
          storedAttachments,
        );
        const displayText = this.resolveInstagramOutboundDisplayText(
          caption,
          mediaType,
          true,
        );
        await this.persistOutboundInstagramMessage({
          conv,
          ownerId,
          messageId,
          text: displayText,
          senderId,
          receiverId: recipient,
          messageDate,
          repliedToExternalId: replyMid ?? null,
          storedAttachments,
          messageType,
        });
      }

      if (caption.length > 0) {
        await this.sendInstagramGraphMessage(accessToken, {
          recipient,
          sendMode,
          message: { text: caption },
        });
      }

      await this.conversationWorkflow.onOutboundAgentReply(conv);
      return mediaResult;
    }

    const result = await this.sendInstagramGraphMessage(accessToken, {
      recipient,
      sendMode,
      replyMid,
      message: { text: caption },
    });

    await this.conversationWorkflow.onOutboundAgentReply(conv);
    return result;
  }

  private async resolveInstagramMessagingSendMode(
    conv: Conversation,
  ): Promise<InstagramMessagingSendMode> {
    const participantId = conv.participantId?.trim();
    if (!participantId) {
      throw new BadRequestException(
        "Cannot send: conversation has no participant_id",
      );
    }

    const lastCustomerMessage = await this.conversationMessageRepo.findOne({
      where: { conversationId: conv.id, senderId: participantId },
      order: { createdAt: "DESC" },
    });
    if (!lastCustomerMessage) {
      throw new BadRequestException(
        "Cannot send: no customer message found in this conversation yet",
      );
    }

    const hoursSinceLastCustomerMessage =
      (Date.now() - lastCustomerMessage.createdAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastCustomerMessage <= INSTAGRAM_RESPONSE_WINDOW_HOURS) {
      return { messagingType: "RESPONSE" };
    }
    if (hoursSinceLastCustomerMessage <= INSTAGRAM_HUMAN_AGENT_WINDOW_HOURS) {
      return { messagingType: "MESSAGE_TAG", tag: "HUMAN_AGENT" };
    }
    throw new BadRequestException(INSTAGRAM_REPLY_WINDOW_EXPIRED_MESSAGE);
  }

  private async resolveGraphAccessToken(companyId: number): Promise<string> {
    const integration = await this.instagramIntegrationRepo.findOne({
      where: { id: companyId },
    });
    const pageToken = integration?.accessToken?.trim();
    if (pageToken) return pageToken;

    throw new ServiceUnavailableException(
      "No Page Graph token: complete Facebook Login so integration.access_token is set.",
    );
  }

  private pickCustomerParticipantId(
    participants: InstagramConversationParticipantDto[],
    pageId: string,
  ): string {
    const ids = participants
      .map((p) => p.id?.trim())
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) return "unknown";
    const page = pageId.trim();
    const notPage = ids.find((id) => id !== page);
    return notPage ?? ids[0];
  }

  private async fetchAllInstagramConversations(
    pageId: string,
    accessToken: string,
  ): Promise<InstagramConversationDto[]> {
    const out: InstagramConversationDto[] = [];
    const fields =
      "id,updated_time,participants{id,name,username,profile_pic},unread_count,message_count";
    let nextUrl: string | null =
      `https://graph.facebook.com/v25.0/${encodeURIComponent(pageId)}/conversations` +
      `?platform=instagram&fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`;

    while (nextUrl) {
      const page: InstagramConversationsResponseDto =
        await this.instagramGraphFetch<InstagramConversationsResponseDto>(
          new URL(nextUrl),
        );
      out.push(...(page.data ?? []));
      nextUrl = page.paging?.next ?? null;
    }
    return out;
  }

  /**
   * Conversation list often omits `profile_pic` on nested participants even when
   * requested. Resolve it via the user profile node (same as User Profile API).
   */
  private async enrichParticipantProfilePics(
    result: InstagramConversationsResponseDto,
    accessToken: string,
  ): Promise<void> {
    const conversations = result.data ?? [];
    const idsMissingPic = new Set<string>();
    for (const conv of conversations) {
      for (const p of conv.participants?.data ?? []) {
        const id = p.id?.trim();
        if (!id) continue;
        if (!p.profile_pic?.trim()) idsMissingPic.add(id);
      }
    }
    if (idsMissingPic.size === 0) return;

    const idList = [...idsMissingPic];
    const picById = new Map<string, string | undefined>();
    const concurrency = 8;
    for (let i = 0; i < idList.length; i += concurrency) {
      const batch = idList.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (id) => {
          const pic = await this.fetchScopedUserProfilePic(id, accessToken);
          picById.set(id, pic);
        }),
      );
    }

    for (const conv of conversations) {
      const participants = conv.participants?.data;
      if (!participants) continue;
      for (const p of participants) {
        const id = p.id?.trim();
        if (!id) continue;
        const fetched = picById.get(id);
        if (fetched && !p.profile_pic?.trim()) {
          p.profile_pic = fetched;
        }
      }
    }
  }

  private async fetchScopedUserProfilePic(
    userId: string,
    accessToken: string,
  ): Promise<string | undefined> {
    const url = new URL(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(userId)}`,
    );
    url.searchParams.set("fields", "profile_pic");
    url.searchParams.set("access_token", accessToken);
    try {
      const body = await this.instagramGraphFetch<{ profile_pic?: string }>(
        url,
      );
      return body.profile_pic?.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Pagination for GET .../messages (database-backed endpoint).
   */
  parseDbPagingForMessages(
    pageRaw?: string,
    pageSizeRaw?: string,
  ): { page: number; pageSize: number } {
    const parseIntStrict = (
      raw: string | undefined,
      field: "page" | "pageSize",
      fallback: number,
    ): number => {
      if (raw == null) return fallback;
      const t = raw.trim();
      if (t.length === 0) return fallback;
      if (!/^\d+$/.test(t)) {
        throw new BadRequestException(`${field} must be a positive integer`);
      }
      const n = Number(t);
      if (!Number.isInteger(n) || n <= 0) {
        throw new BadRequestException(`${field} must be a positive integer`);
      }
      return n;
    };

    const page = parseIntStrict(pageRaw, "page", 1);
    const pageSize = parseIntStrict(pageSizeRaw, "pageSize", 50);
    const maxPageSize = 200;
    if (pageSize > maxPageSize) {
      throw new BadRequestException(`pageSize must be <= ${maxPageSize}`);
    }
    return { page, pageSize };
  }

  /**
   * Meta OAuth / Graph: (#230) = token cannot access messaging for this Page without
   * `pages_messaging` (and related Instagram messaging scopes on the Page token).
   */
  private throwIfInstagramGraphFailure(
    ok: boolean,
    status: number,
    body: unknown,
  ): void {
    if (ok) return;
    const err = body as InstagramErrorResponse;
    const code = err?.error?.code;
    const msg =
      err?.error?.message ??
      `Instagram Graph API request failed with status ${status}`;
    if (
      code === 230 ||
      /pages_messaging/i.test(msg) ||
      /\(#[0-9]+\)\s*Requires pages_messaging/i.test(msg)
    ) {
      throw new ForbiddenException(
        "Facebook / Instagram access token is missing the pages_messaging permission (Graph error #230). " +
          "In developers.facebook.com: add “pages_messaging” (and Instagram messaging scopes your product needs) to the app, " +
          "re-run Login / Page install so the Page token includes those permissions, then store the new token on this company.",
      );
    }
    throw new BadGatewayException(msg);
  }

  private async sendInstagramGraphMessage(
    accessToken: string,
    params: {
      recipient: string;
      sendMode: InstagramMessagingSendMode;
      replyMid?: string;
      message: Record<string, unknown>;
    },
  ): Promise<SendInstagramMessageResponseDto> {
    const sendBody: Record<string, unknown> = {
      recipient: { id: params.recipient },
      message: params.message,
      messaging_type: params.sendMode.messagingType,
    };
    if (params.sendMode.messagingType === "MESSAGE_TAG") {
      sendBody.tag = params.sendMode.tag;
    }
    const replyMid = params.replyMid?.trim();
    if (replyMid) {
      sendBody.reply_to = { mid: replyMid };
    }

    const url = new URL("https://graph.facebook.com/v25.0/me/messages");
    url.searchParams.set("access_token", accessToken);

    return this.instagramGraphFetch<SendInstagramMessageResponseDto>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sendBody),
    });
  }

  private async uploadInstagramMessageAttachment(
    accessToken: string,
    file: { buffer: Buffer; mimetype?: string; originalname?: string },
    mediaType: OutboundConversationMessageMediaType,
  ): Promise<string> {
    const url = new URL(
      "https://graph.facebook.com/v25.0/me/message_attachments",
    );
    url.searchParams.set("access_token", accessToken);

    const form = new FormData();
    form.append(
      "message",
      JSON.stringify({
        attachment: {
          type: mediaType,
          payload: { is_reusable: true },
        },
      }),
    );
    const filename = file.originalname?.trim() || `${mediaType}-upload`;
    const mime = file.mimetype?.trim() || "application/octet-stream";
    form.append(
      "filedata",
      new Blob([new Uint8Array(file.buffer)], { type: mime }),
      filename,
    );

    const result = await this.instagramGraphFetch<{ attachment_id?: string }>(
      url,
      { method: "POST", body: form },
    );
    const attachmentId = result.attachment_id?.trim();
    if (!attachmentId) {
      throw new BadGatewayException("Instagram did not return attachment_id");
    }
    return attachmentId;
  }

  private async archiveInstagramOutboundFile(
    file: { buffer: Buffer; mimetype?: string; originalname?: string },
    mediaType: OutboundConversationMessageMediaType,
    context: {
      conversationId: number;
      messageExternalId: string;
      messageAt: Date;
    },
  ): Promise<StoredMessageAttachment[]> {
    const archived = await this.mediaArchive.archiveOutboundAttachment({
      mediaType,
      buffer: file.buffer,
      contentType: file.mimetype ?? "application/octet-stream",
      filename: file.originalname?.trim() || `${mediaType}-upload`,
      context,
    });
    return archived ? [archived] : [];
  }

  private resolveInstagramOutboundMessageType(
    mediaType: OutboundConversationMessageMediaType,
    storedAttachments: StoredMessageAttachment[],
  ): ConversationMessageType {
    if (storedAttachments.length > 0) {
      return resolveMessageTypeFromAttachments(storedAttachments);
    }
    if (mediaType === "image") {
      return ConversationMessageType.image;
    }
    if (mediaType === "video") {
      return ConversationMessageType.video;
    }
    if (mediaType === "audio") {
      return ConversationMessageType.audio;
    }
    return ConversationMessageType.text;
  }

  private resolveInstagramOutboundDisplayText(
    caption: string,
    mediaType: OutboundConversationMessageMediaType,
    captionSentSeparately = false,
  ): string {
    if (caption.length > 0 && !captionSentSeparately) {
      return caption;
    }
    if (mediaType === "image") {
      return "[Photo]";
    }
    if (mediaType === "video") {
      return "[Video]";
    }
    return "[Audio]";
  }

  private buildInstagramLegacyAttachmentsFromStored(
    stored: StoredMessageAttachment[],
  ): { data: Array<Record<string, unknown>> } | undefined {
    if (stored.length === 0) {
      return undefined;
    }
    return {
      data: stored.map((item) => {
        const attachment: Record<string, unknown> = {
          name: item.name,
          file_url: item.url,
          r2_url: item.url,
        };
        if (item.r2_key) {
          attachment.r2_key = item.r2_key;
        }
        if (item.type === "image") {
          attachment.image_data = { url: item.url };
          attachment.mime_type = "image/jpeg";
        } else if (item.type === "video") {
          attachment.video_data = { url: item.url, preview_url: item.url };
          attachment.mime_type = "video/mp4";
        } else if (item.type === "audio") {
          attachment.mime_type = "audio/ogg";
        }
        return attachment;
      }),
    };
  }

  private async persistOutboundInstagramMessage(params: {
    conv: Conversation;
    ownerId: number;
    messageId: string;
    text: string;
    senderId: string;
    receiverId: string;
    messageDate: Date;
    repliedToExternalId: string | null;
    storedAttachments: StoredMessageAttachment[];
    messageType: ConversationMessageType;
  }): Promise<void> {
    const externalId = params.messageId.trim();
    if (!externalId) {
      return;
    }

    const existing = await this.conversationMessageRepo.findOne({
      where: { conversationId: params.conv.id, externalId },
    });
    if (existing) {
      return;
    }

    const legacyAttachments = this.buildInstagramLegacyAttachmentsFromStored(
      params.storedAttachments,
    );
    const instagramJson = JSON.stringify({
      id: externalId,
      created_time: params.messageDate.toISOString(),
      message: params.text,
      from: { id: params.senderId },
      to: { data: [{ id: params.receiverId }] },
      ...(legacyAttachments ? { attachments: legacyAttachments } : {}),
    });

    const row = this.conversationMessageRepo.create({
      conversationId: params.conv.id,
      externalId,
      message: params.text,
      instagramJson,
      createdAt: params.messageDate,
      senderId: params.senderId,
      receiverId: params.receiverId,
      readAt: null,
      repliedToExternalId: params.repliedToExternalId,
      attachmentJson: serializeAttachmentsJson(params.storedAttachments),
      messageType: params.messageType,
    });

    const saved = await this.conversationMessageRepo.save(row);
    await this.messageNotify.notifyPersistedMessage(saved, params.ownerId);
  }

  private async instagramGraphFetch<T>(
    url: URL,
    init?: RequestInit,
  ): Promise<T> {
    const response = await fetch(url.toString(), init);
    const bodyText = await response.text();
    let body: T | InstagramErrorResponse = {} as T;
    if (bodyText) {
      try {
        body = JSON.parse(bodyText) as T | InstagramErrorResponse;
      } catch {
        throw new BadGatewayException(
          "Instagram Graph API returned invalid JSON",
        );
      }
    }

    this.throwIfInstagramGraphFailure(response.ok, response.status, body);

    return body as T;
  }
}
