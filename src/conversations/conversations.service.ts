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
import { Brackets, FindOptionsWhere, In, Repository } from "typeorm";
import {
  InstagramIntegration,
  Conversation,
  ConversationGroup,
  ConversationMessage,
  ConversationSource,
  InstagramUser,
  TelegramUser,
  TelegramIntegration,
  TelegramIntegrationStatus,
  WorkspaceMember,
  WorkspaceMemberStatus,
  ProductSuggestion,
  Product,
  ProductVariant,
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
import { ConversationEventsService } from "./conversation-events.service";
import { ConversationGroupDefaultsService } from "./conversation-group-defaults.service";
import { ConversationWorkflowService } from "./conversation-workflow.service";
import { mergeMessageJsonPreservingReactions } from "./instagram-message-reactions.util";
import { INSTAGRAM_GRAPH_MESSAGE_ATTACHMENTS_FIELDS } from "./instagram-graph-message-fields";
import type { SendInstagramMessageResponseDto } from "./dto/http/send-instagram-message-response.dto";
import {
  TELEGRAM_CONVERSATION_MESSAGING,
  type TelegramConversationMessagingPort,
} from "../telegram-integrations/telegram-integrations.tokens";
import { TelegramUsersService } from "../telegram-integrations/telegram-users.service";
import { ProductsService } from "../products/products.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { WorkspacePermissionsService } from "../workspace-access/workspace-permissions.service";
import type { ResolvedIntegrationGrant } from "../workspace-access/permissions/resolved-permissions.type";
import type {
  ConversationRowDto,
  ConversationParticipantDto,
} from "./dto/http/conversations-list-response.dto";
import type { ConversationEventsListResponseDto } from "./dto/http/conversation-events-list-response.dto";
import type { UpdateConversationRequestDto } from "./dto/http/update-conversation-request.dto";
import type { ConversationProductSuggestionsResponseDto } from "./dto/http/conversation-product-suggestions-response.dto";
import type { ProductSuggestionItemDto } from "./dto/http/conversation-product-suggestions-response.dto";
import type { CreateProductSuggestionRequestDto } from "./dto/http/create-product-suggestion-request.dto";
import type { InstagramGraphMessagesResponseDto } from "./dto/http/instagram-graph-messages-response.dto";
import type { ListInstagramGraphMessagesQueryDto } from "./dto/http/list-instagram-graph-messages-query.dto";
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
    private readonly messagePresenter: ConversationMessagePresenterService,
    @Inject(forwardRef(() => ConversationMessageNotifyService))
    private readonly messageNotify: ConversationMessageNotifyService,
    @Inject(TELEGRAM_CONVERSATION_MESSAGING)
    private readonly telegramMessaging: TelegramConversationMessagingPort,
    private readonly telegramUsers: TelegramUsersService,
    private readonly products: ProductsService,
    private readonly conversationWorkflow: ConversationWorkflowService,
    private readonly conversationEvents: ConversationEventsService,
    private readonly conversationGroupDefaults: ConversationGroupDefaultsService,
    private readonly workspacePermissions: WorkspacePermissionsService,
  ) {}

  async listConversationsForOwner(
    ownerId: number,
    filters: {
      sessionWorkspaceId: number;
      groupIds?: number[];
      appRole?: string;
    },
  ): Promise<{
    items: ConversationRowDto[];
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

    const groupIds = await this.validateOptionalGroupIds(
      workspaceId,
      filters.groupIds,
    );

    const rows =
      permissions.isOwner || permissions.conversations.fullAccess
        ? await this.findConversationsForWorkspace(workspaceId, groupIds)
        : await this.findConversationsForIntegrationGrants(
            workspaceId,
            ownerId,
            permissions.integrationGrants,
            groupIds,
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
      await this.getLastMessageByConversationIds(rows.map((r) => r.id));
    const { instagramById, telegramById } =
      await this.getParticipantMapsForRows(rows, { maxTelegramSync: 10 });

    return {
      items: rows.map((r) =>
        this.toConversationRowDto(
          r,
          lastMessageByConversationId.get(r.id),
          instagramById,
          telegramById,
          myAccountIds,
          listAccessContext
            ? this.resolveCanTakeChatFlag(r, listAccessContext)
            : false,
        ),
      ),
    };
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

  async getConversationForOwnerById(
    ownerId: number,
    id: number,
  ): Promise<ConversationRowDto> {
    const integration =
      await this.workspaceContext.requireInstagramIntegrationForOwner(ownerId);
    const row = await this.requireConversationInWorkspace(ownerId, { id });
    const myAccountIds = await this.buildMyAccountIds(ownerId, integration, row);
    const lastMessageByConversationId =
      await this.getLastMessageByConversationIds([row.id]);
    const { instagramById, telegramById } =
      await this.getParticipantMapsForRows([row], { maxTelegramSync: 1 });
    return this.toConversationRowDto(
      row,
      lastMessageByConversationId.get(row.id),
      instagramById,
      telegramById,
      myAccountIds,
      false,
    );
  }

  /**
   * Updates conversation fields (group and/or responsible member).
   */
  async updateConversationForOwner(
    ownerId: number,
    conversationId: number,
    dto: UpdateConversationRequestDto,
  ): Promise<ConversationRowDto> {
    if (
      dto.groupId === undefined &&
      dto.responsible_member_id === undefined
    ) {
      throw new BadRequestException(
        "At least one of groupId or responsible_member_id is required",
      );
    }

    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
    );
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
        if (!member.canBeAssignedToChat) {
          throw new BadRequestException(
            "Workspace member is not eligible for chat assignment",
          );
        }
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

  async listConversationEventsForOwner(
    ownerId: number,
    conversationId: number,
  ): Promise<ConversationEventsListResponseDto> {
    const conv = await this.requireConversationInWorkspace(ownerId, {
      id: conversationId,
    });
    const rows = await this.conversationEvents.listForConversation(conversationId);
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
        rows.map((row) => row.postId?.trim()).filter((id): id is string => !!id),
      ),
    ];

    return {
      conversationId,
      postId: postIds.length === 1 ? postIds[0]! : null,
      businessAccountId: conv.externalSourceId?.trim() || null,
      items,
    };
  }

  async createProductSuggestionForOwner(
    ownerId: number,
    dto: CreateProductSuggestionRequestDto,
  ): Promise<ProductSuggestionItemDto> {
    const conv = await this.requireConversationInWorkspace(ownerId, {
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
      }),
    );

    return this.toProductSuggestionItem(row);
  }

  private toProductSuggestionItem(row: ProductSuggestion): ProductSuggestionItemDto {
    return {
      id: row.id,
      productId: row.productId,
      productVariantId: row.productVariantId,
      conversationId: row.conversationId,
      postId: row.postId,
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
    canTakeChat: boolean,
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
      canTakeChat,
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

  private async findConversationsForWorkspace(
    workspaceId: number,
    groupIds?: number[],
  ): Promise<Conversation[]> {
    const where: FindOptionsWhere<Conversation> =
      groupIds != null && groupIds.length > 0
        ? { workspaceId, groupId: In(groupIds) }
        : { workspaceId };
    return this.conversationRepo.find({
      where,
      order: { instUpdatedAt: "DESC" },
    });
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
      (
        instagramIds.length > 0
          ? await this.instagramIntegrationRepo.find({
              where: { workspaceId, id: In(instagramIds) },
            })
          : []
      ).map((row) => [row.id, row]),
    );
    const telegramById = new Map(
      (
        telegramIds.length > 0
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
    groupIds?: number[],
  ): Promise<Conversation[]> {
    if (grants.length === 0) {
      return [];
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

    const qb = this.conversationRepo
      .createQueryBuilder("c")
      .where("c.workspace_id = :workspaceId", { workspaceId });

    if (groupIds != null && groupIds.length > 0) {
      qb.andWhere("c.group_id IN (:...groupIds)", { groupIds });
    }

    qb.andWhere(
      new Brackets((sub) => {
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
              if (
                grant.canTakeChat &&
                grant.write === "mine" &&
                memberId != null
              ) {
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
              if (
                grant.canTakeChat &&
                grant.write === "mine" &&
                memberId != null
              ) {
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
      };
    }

    const participant = instagramById.get(participantKey);
    if (!participant) return null;
    return {
      id: participant.id,
      name: participant.name,
      username: participant.username,
      profilePic: participant.profilePic,
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
      this.getInstagramUsersByIds(instagramIds),
      this.getTelegramUsersByIds(telegramIds),
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
      toSync.map((row) => row.participantId),
    );
    for (const [id, user] of refreshed) {
      telegramById.set(id, user);
    }

    return { instagramById, telegramById };
  }

  private async getInstagramUsersByIds(
    ids: string[],
  ): Promise<Map<string, InstagramUser>> {
    const uniqIds = [...new Set(ids.map((id) => id?.trim()).filter(Boolean))];
    if (uniqIds.length === 0) return new Map();
    const users = await this.instagramUserRepo.find({
      where: { id: In(uniqIds) },
    });
    return new Map(users.map((u) => [u.id, u]));
  }

  private async getTelegramUsersByIds(
    ids: string[],
  ): Promise<Map<string, TelegramUser>> {
    const uniqIds = [...new Set(ids.map((id) => id?.trim()).filter(Boolean))];
    if (uniqIds.length === 0) return new Map();
    const users = await this.telegramUserRepo.find({
      where: { id: In(uniqIds) },
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

  /** Upserts `instagram_users` from message actors + optional conversation participants (Graph profile fields). */
  private async syncInstagramUsersForWebhookAllocation(
    msg: InstagramMessageDto,
    participantExtras: InstagramConversationParticipantDto[] | undefined,
    accessToken: string,
    traceId: string,
    /** e.g. user who sent a reaction (from webhook `sender`) */
    webhookSenderHintId?: string | null,
  ): Promise<void> {
    const t = `[webhook trace=${traceId}]`;
    const ids = new Set<string>();
    const take = (id: string | undefined) => {
      const x = id?.trim();
      if (x && this.isLikelyInstagramPsid(x)) ids.add(x);
    };
    take(msg.from?.id);
    for (const u of msg.to?.data ?? []) take(u.id);
    for (const p of participantExtras ?? []) take(p.id);
    take(webhookSenderHintId ?? undefined);
    for (const item of msg.reactions?.data ?? []) {
      const users = (item as { users?: Array<{ id?: string }> }).users;
      for (const u of users ?? []) take(u.id);
    }

    for (const instagramUserId of ids) {
      try {
        await this.upsertInstagramUserFromGraph(instagramUserId, accessToken);
        this.log.debug(`${t} instagram_users upserted id=${instagramUserId}`);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        this.log.warn(
          `${t} instagram_users upsert failed id=${instagramUserId}: ${err}`,
        );
      }
    }
  }

  private async upsertInstagramUserFromGraph(
    instagramUserId: string,
    accessToken: string,
  ): Promise<void> {
    const url = new URL(
      `https://graph.facebook.com/v25.0/${encodeURIComponent(instagramUserId)}`,
    );
    url.searchParams.set("access_token", accessToken);
    const node = await this.instagramGraphFetch<{
      id?: string;
      name?: string;
      username?: string;
      profile_pic?: string;
    }>(url);

    const name =
      node.name?.trim() ||
      node.username?.trim() ||
      node.id?.trim() ||
      instagramUserId;
    const username =
      node.username?.trim() || node.id?.trim() || instagramUserId;
    const profilePic = node.profile_pic?.trim() || "";
    const now = new Date();

    let row = await this.instagramUserRepo.findOne({
      where: { id: instagramUserId },
    });
    if (!row) {
      row = this.instagramUserRepo.create({
        id: instagramUserId,
        name,
        username,
        profilePic,
        syncedAt: now,
        lastSeen: now,
      });
    } else {
      row.name = name;
      row.username = username;
      row.profilePic = profilePic;
      row.syncedAt = now;
      row.lastSeen = now;
    }
    await this.instagramUserRepo.save(row);
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
    url.searchParams.set("fields", INSTAGRAM_GRAPH_CONVERSATION_MESSAGES_FIELDS);
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
  ): Promise<SendInstagramMessageResponseDto> {
    const conv = await this.requireConversationForOwnerFromParam(
      ownerId,
      conversationIdParam,
    );
    if (conv.source === ConversationSource.TELEGRAM) {
      return this.telegramMessaging.sendMessageForConversation(
        ownerId,
        conv,
        message,
        replyToId,
      );
    }
    return this.sendInstagramMessageForConversation(
      ownerId,
      conv,
      message,
      replyToId,
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

    const text = message.trim();
    if (!text) {
      throw new BadRequestException("message must not be empty");
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

    /** Instagram Messaging: `reply_to` is a root-level sibling of `message`, not inside it. */
    const sendBody: Record<string, unknown> = {
      recipient: { id: recipient },
      message: { text },
      messaging_type: sendMode.messagingType,
    };
    if (sendMode.messagingType === "MESSAGE_TAG") {
      sendBody.tag = sendMode.tag;
    }
    if (replyMid) {
      sendBody.reply_to = { mid: replyMid };
    }

    const url = new URL("https://graph.facebook.com/v25.0/me/messages");
    url.searchParams.set("access_token", accessToken);

    const result =
      await this.instagramGraphFetch<SendInstagramMessageResponseDto>(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sendBody),
      });

    const maybeError = result as unknown as InstagramErrorResponse;
    if (maybeError.error?.message) {
      throw new BadGatewayException(maybeError.error.message);
    }

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
