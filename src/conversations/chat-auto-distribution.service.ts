import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import {
  ChatAutoDistributionLog,
  Conversation,
  ConversationSource,
  InstagramIntegration,
  TelegramIntegration,
  WorkspaceMember,
  WorkspaceMemberStatus,
  WorkspaceMemberWorkStatus,
} from "../database/entities";
import type { IntegrationType } from "../integrations/integration-type";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { canTakeChat } from "../workspace-access/permissions/permissions-resolver";
import { WorkspacePermissionsService } from "../workspace-access/workspace-permissions.service";
import { ConversationWorkflowService } from "./conversation-workflow.service";
import type { ChatAutoDistributionLogResponseDto } from "./dto/http/chat-auto-distribution-log-response.dto";
import type { ListChatAutoDistributionLogQueryDto } from "./dto/http/list-chat-auto-distribution-log-query.dto";

/**
 * Auto-assigns newly created live chats when the source channel has
 * `chat_auto_distribution` enabled.
 *
 * Eligible members:
 * - active workspace membership
 * - `work_status = accepting_new_chats`
 * - owner OR conversations.full_access OR integration grant `canTakeChat`
 *   («Брати непризначені») for that channel
 *
 * Pick: least currently assigned open load, then lowest member id (stable fair share).
 * Skips history/sync creation paths — only call from live inbound channels.
 * Successful assignments are written to `chat_auto_distribution_logs`.
 */
@Injectable()
export class ChatAutoDistributionService {
  private readonly log = new Logger(ChatAutoDistributionService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(InstagramIntegration)
    private readonly instagramIntegrationRepo: Repository<InstagramIntegration>,
    @InjectRepository(TelegramIntegration)
    private readonly telegramIntegrationRepo: Repository<TelegramIntegration>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepo: Repository<WorkspaceMember>,
    @InjectRepository(ChatAutoDistributionLog)
    private readonly logRepo: Repository<ChatAutoDistributionLog>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly workspacePermissions: WorkspacePermissionsService,
    private readonly conversationWorkflow: ConversationWorkflowService,
  ) {}

  async tryAssignOnNewConversation(
    conversation: Conversation,
  ): Promise<void> {
    try {
      if (conversation.responsibleMemberId != null) {
        return;
      }

      const resolved = await this.resolveLiveIntegration(conversation);
      if (!resolved?.chatAutoDistribution) {
        return;
      }

      const candidates = await this.listEligibleMembers(
        conversation.workspaceId,
        resolved.integrationType,
        resolved.integrationId,
      );
      if (candidates.length === 0) {
        this.log.debug(
          `Auto-distribution: no eligible members conversationId=${conversation.id} ` +
            `${resolved.integrationType}#${resolved.integrationId}`,
        );
        return;
      }

      const memberId = await this.pickLeastLoadedMember(
        conversation.workspaceId,
        candidates.map((m) => m.id),
      );
      if (memberId == null) {
        return;
      }

      const selected = candidates.find((m) => m.id === memberId);
      if (!selected) {
        return;
      }

      const assigned = await this.dataSource.transaction(async (em) => {
        const locked = await em.findOne(Conversation, {
          where: {
            id: conversation.id,
            workspaceId: conversation.workspaceId,
          },
          lock: { mode: "pessimistic_write" },
        });
        if (!locked || locked.responsibleMemberId != null) {
          return null;
        }

        locked.responsibleMemberId = memberId;
        locked.responsibleMemberSetAt = new Date();
        await em.save(locked);

        const logRepo = em.getRepository(ChatAutoDistributionLog);
        await logRepo.save(
          logRepo.create({
            workspaceId: locked.workspaceId,
            integrationType: resolved.integrationType,
            integrationId: resolved.integrationId,
            conversationId: locked.id,
            memberId: selected.id,
            userId: selected.userId,
          }),
        );

        return locked;
      });

      if (!assigned) {
        return;
      }

      conversation.responsibleMemberId = assigned.responsibleMemberId;
      conversation.responsibleMemberSetAt = assigned.responsibleMemberSetAt;

      await this.conversationWorkflow.onResponsibleMemberChange(
        assigned,
        null,
        memberId,
        null,
        { source: "auto_distribution" },
      );

      this.log.log(
        `Auto-distributed conversationId=${conversation.id} → memberId=${memberId} ` +
          `${resolved.integrationType}#${resolved.integrationId}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn(
        `Auto-distribution failed conversationId=${conversation.id}: ${message}`,
      );
    }
  }

  async listLogForOwner(
    ownerId: number,
    query: ListChatAutoDistributionLogQueryDto,
    appRole?: string,
    workspaceIdParam?: number,
  ): Promise<ChatAutoDistributionLogResponseDto> {
    const workspace = await this.workspaceContext.requireWorkspaceForOwner(
      ownerId,
      appRole,
      workspaceIdParam,
    );
    const workspaceId = workspace.id;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const qb = this.logRepo
      .createQueryBuilder("l")
      .leftJoinAndSelect("l.user", "u")
      .where("l.workspaceId = :workspaceId", { workspaceId });

    if (query.integrationType) {
      qb.andWhere("l.integrationType = :integrationType", {
        integrationType: query.integrationType,
      });
    }
    if (query.integrationId != null) {
      qb.andWhere("l.integrationId = :integrationId", {
        integrationId: query.integrationId,
      });
    }
    if (query.memberId != null) {
      qb.andWhere("l.memberId = :memberId", { memberId: query.memberId });
    }
    if (query.createdFrom) {
      qb.andWhere("l.createdAt >= :createdFrom", {
        createdFrom: this.parseDateBoundary(query.createdFrom, "start"),
      });
    }
    if (query.createdTo) {
      qb.andWhere("l.createdAt <= :createdTo", {
        createdTo: this.parseDateBoundary(query.createdTo, "end"),
      });
    }

    const total = await qb.clone().getCount();
    const rows = await qb
      .orderBy("l.createdAt", "DESC")
      .addOrderBy("l.id", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    const channelNames = await this.loadChannelNameMap(workspaceId);
    const items = rows.map((row) => {
      const type = row.integrationType as "instagram" | "telegram";
      return {
        id: row.id,
        conversationId: row.conversationId,
        integrationType: type,
        integrationId: row.integrationId,
        channelName: this.channelLabel(type, row.integrationId, channelNames),
        memberId: row.memberId,
        userId: row.userId,
        name: this.displayName(row.user),
        email: row.user?.email ?? "",
        createdAt: row.createdAt,
      };
    });

    const summary = await this.buildSummary(
      workspaceId,
      {
        integrationType: query.integrationType,
        integrationId: query.integrationId,
        memberId: query.memberId,
        createdFrom: query.createdFrom,
        createdTo: query.createdTo,
      },
      channelNames,
    );

    return {
      summary,
      items,
      total,
      page,
      pageSize,
    };
  }

  private async buildSummary(
    workspaceId: number,
    filters: {
      integrationType?: "instagram" | "telegram";
      integrationId?: number;
      memberId?: number;
      createdFrom?: string;
      createdTo?: string;
    },
    channelNames: Map<string, string>,
  ): Promise<ChatAutoDistributionLogResponseDto["summary"]> {
    const base = this.logRepo
      .createQueryBuilder("l")
      .where("l.workspaceId = :workspaceId", { workspaceId });

    if (filters.integrationType) {
      base.andWhere("l.integrationType = :integrationType", {
        integrationType: filters.integrationType,
      });
    }
    if (filters.integrationId != null) {
      base.andWhere("l.integrationId = :integrationId", {
        integrationId: filters.integrationId,
      });
    }
    if (filters.memberId != null) {
      base.andWhere("l.memberId = :memberId", { memberId: filters.memberId });
    }
    if (filters.createdFrom) {
      base.andWhere("l.createdAt >= :createdFrom", {
        createdFrom: this.parseDateBoundary(filters.createdFrom, "start"),
      });
    }
    if (filters.createdTo) {
      base.andWhere("l.createdAt <= :createdTo", {
        createdTo: this.parseDateBoundary(filters.createdTo, "end"),
      });
    }

    const total = await base.clone().getCount();

    const byChannelRaw = await base
      .clone()
      .select("l.integrationType", "integrationType")
      .addSelect("l.integrationId", "integrationId")
      .addSelect("COUNT(*)", "count")
      .groupBy("l.integrationType")
      .addGroupBy("l.integrationId")
      .orderBy("COUNT(*)", "DESC")
      .getRawMany<{
        integrationType: string;
        integrationId: string | number;
        count: string | number;
      }>();

    const byMemberRaw = await base
      .clone()
      .leftJoin("l.user", "u")
      .select("l.memberId", "memberId")
      .addSelect("l.userId", "userId")
      .addSelect("u.firstName", "firstName")
      .addSelect("u.lastName", "lastName")
      .addSelect("u.email", "email")
      .addSelect("COUNT(*)", "count")
      .groupBy("l.memberId")
      .addGroupBy("l.userId")
      .addGroupBy("u.firstName")
      .addGroupBy("u.lastName")
      .addGroupBy("u.email")
      .orderBy("COUNT(*)", "DESC")
      .getRawMany<{
        memberId: string | number;
        userId: string | number;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        count: string | number;
      }>();

    const byChannelAndMemberRaw = await base
      .clone()
      .leftJoin("l.user", "u")
      .select("l.integrationType", "integrationType")
      .addSelect("l.integrationId", "integrationId")
      .addSelect("l.memberId", "memberId")
      .addSelect("l.userId", "userId")
      .addSelect("u.firstName", "firstName")
      .addSelect("u.lastName", "lastName")
      .addSelect("u.email", "email")
      .addSelect("COUNT(*)", "count")
      .groupBy("l.integrationType")
      .addGroupBy("l.integrationId")
      .addGroupBy("l.memberId")
      .addGroupBy("l.userId")
      .addGroupBy("u.firstName")
      .addGroupBy("u.lastName")
      .addGroupBy("u.email")
      .orderBy("l.integrationType", "ASC")
      .addOrderBy("l.integrationId", "ASC")
      .addOrderBy("COUNT(*)", "DESC")
      .getRawMany<{
        integrationType: string;
        integrationId: string | number;
        memberId: string | number;
        userId: string | number;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
        count: string | number;
      }>();

    return {
      total,
      byChannel: byChannelRaw.map((row) => {
        const type = row.integrationType as "instagram" | "telegram";
        const integrationId = Number(row.integrationId);
        return {
          integrationType: type,
          integrationId,
          channelName: this.channelLabel(type, integrationId, channelNames),
          count: Number(row.count) || 0,
        };
      }),
      byMember: byMemberRaw.map((row) => ({
        memberId: Number(row.memberId),
        userId: Number(row.userId),
        name: this.displayNameFromParts(row.firstName, row.lastName),
        email: row.email?.trim() || "",
        count: Number(row.count) || 0,
      })),
      byChannelAndMember: byChannelAndMemberRaw.map((row) => {
        const type = row.integrationType as "instagram" | "telegram";
        const integrationId = Number(row.integrationId);
        return {
          integrationType: type,
          integrationId,
          channelName: this.channelLabel(type, integrationId, channelNames),
          memberId: Number(row.memberId),
          userId: Number(row.userId),
          name: this.displayNameFromParts(row.firstName, row.lastName),
          email: row.email?.trim() || "",
          count: Number(row.count) || 0,
        };
      }),
    };
  }

  private async loadChannelNameMap(
    workspaceId: number,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const [instagramRows, telegramRows] = await Promise.all([
      this.instagramIntegrationRepo.find({ where: { workspaceId } }),
      this.telegramIntegrationRepo.find({ where: { workspaceId } }),
    ]);
    for (const row of instagramRows) {
      const name =
        row.facebookPageName?.trim() ||
        row.name?.trim() ||
        `Instagram #${row.id}`;
      map.set(`instagram:${row.id}`, name);
    }
    for (const row of telegramRows) {
      const phone = row.phoneNumber?.trim();
      const name =
        (phone && !phone.startsWith("qr:") ? phone : null) ||
        row.name?.trim() ||
        `Telegram #${row.id}`;
      map.set(`telegram:${row.id}`, name);
    }
    return map;
  }

  private channelLabel(
    type: "instagram" | "telegram",
    integrationId: number,
    names: Map<string, string>,
  ): string {
    return (
      names.get(`${type}:${integrationId}`) ??
      `${type === "instagram" ? "Instagram" : "Telegram"} #${integrationId}`
    );
  }

  private displayName(
    user?: { firstName?: string | null; lastName?: string | null } | null,
  ): string {
    return this.displayNameFromParts(user?.firstName, user?.lastName);
  }

  private displayNameFromParts(
    firstName?: string | null,
    lastName?: string | null,
  ): string {
    return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ");
  }

  private parseDateBoundary(
    value: string,
    boundary: "start" | "end",
  ): Date {
    const trimmed = value.trim();
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return date;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      if (boundary === "start") {
        date.setUTCHours(0, 0, 0, 0);
      } else {
        date.setUTCHours(23, 59, 59, 999);
      }
    }
    return date;
  }

  private async resolveLiveIntegration(conversation: Conversation): Promise<{
    integrationType: IntegrationType;
    integrationId: number;
    chatAutoDistribution: boolean;
  } | null> {
    if (conversation.source === ConversationSource.TELEGRAM) {
      const integrationId = Number.parseInt(
        conversation.externalSourceId?.trim() ?? "",
        10,
      );
      if (!Number.isInteger(integrationId) || integrationId <= 0) {
        return null;
      }
      const row = await this.telegramIntegrationRepo.findOne({
        where: {
          id: integrationId,
          workspaceId: conversation.workspaceId,
        },
      });
      if (!row) {
        return null;
      }
      return {
        integrationType: "telegram",
        integrationId: row.id,
        chatAutoDistribution: row.chatAutoDistribution === true,
      };
    }

    if (conversation.source !== ConversationSource.INSTAGRAM) {
      return null;
    }

    const externalSourceId = conversation.externalSourceId?.trim();
    if (!externalSourceId) {
      return null;
    }

    const integrations = await this.instagramIntegrationRepo.find({
      where: { workspaceId: conversation.workspaceId },
    });
    const row = integrations.find((item) => {
      const pageId = item.pageId?.trim();
      const accountId = item.instagramAccountId?.trim();
      return pageId === externalSourceId || accountId === externalSourceId;
    });
    if (!row) {
      return null;
    }
    return {
      integrationType: "instagram",
      integrationId: row.id,
      chatAutoDistribution: row.chatAutoDistribution === true,
    };
  }

  private async listEligibleMembers(
    workspaceId: number,
    integrationType: IntegrationType,
    integrationId: number,
  ): Promise<WorkspaceMember[]> {
    const members = await this.workspaceMemberRepo.find({
      where: {
        workspaceId,
        status: WorkspaceMemberStatus.ACTIVE,
        workStatus: WorkspaceMemberWorkStatus.ACCEPTING_NEW_CHATS,
      },
      order: { id: "ASC" },
    });

    const eligible: WorkspaceMember[] = [];
    for (const member of members) {
      const permissions = await this.workspacePermissions.getResolvedForUser(
        member.userId,
        undefined,
        workspaceId,
      );
      if (
        permissions.isOwner ||
        permissions.conversations.fullAccess ||
        canTakeChat(permissions, integrationType, integrationId)
      ) {
        eligible.push(member);
      }
    }
    return eligible;
  }

  private async pickLeastLoadedMember(
    workspaceId: number,
    memberIds: number[],
  ): Promise<number | null> {
    if (memberIds.length === 0) {
      return null;
    }
    if (memberIds.length === 1) {
      return memberIds[0]!;
    }

    const rows = await this.conversationRepo
      .createQueryBuilder("c")
      .select("c.responsibleMemberId", "memberId")
      .addSelect("COUNT(*)", "cnt")
      .where("c.workspaceId = :workspaceId", { workspaceId })
      .andWhere("c.responsibleMemberId IN (:...memberIds)", { memberIds })
      .groupBy("c.responsibleMemberId")
      .getRawMany<{ memberId: string | number; cnt: string | number }>();

    const load = new Map<number, number>();
    for (const id of memberIds) {
      load.set(id, 0);
    }
    for (const row of rows) {
      const id = Number(row.memberId);
      if (Number.isInteger(id) && load.has(id)) {
        load.set(id, Number(row.cnt) || 0);
      }
    }

    let bestId = memberIds[0]!;
    let bestLoad = load.get(bestId) ?? 0;
    for (const id of memberIds) {
      const current = load.get(id) ?? 0;
      if (current < bestLoad || (current === bestLoad && id < bestId)) {
        bestId = id;
        bestLoad = current;
      }
    }
    return bestId;
  }
}
