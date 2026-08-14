import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Conversation,
  ConversationEventType,
  ConversationFollowUp,
  ConversationFollowUpStatus,
  Workspace,
} from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { WorkspacePermissionsService } from "../workspace-access/workspace-permissions.service";
import { ConversationEventsService } from "./conversation-events.service";
import { ConversationsService } from "./conversations.service";
import type {
  CreateConversationFollowUpDto,
  UpdateConversationFollowUpDto,
} from "./dto/http/conversation-follow-up-request.dto";
import type { ConversationFollowUpResponseDto } from "./dto/http/conversation-follow-up-response.dto";

export const FollowUpCancelReason = {
  MANUAL: "manual",
  CUSTOMER_REPLY: "customer_reply",
  CONVERSATION_DELETED: "conversation_deleted",
} as const;

const MESSAGE_PREVIEW_MAX = 280;

@Injectable()
export class ConversationFollowUpsService {
  private readonly log = new Logger(ConversationFollowUpsService.name);

  constructor(
    @InjectRepository(ConversationFollowUp)
    private readonly followUpRepo: Repository<ConversationFollowUp>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly workspacePermissions: WorkspacePermissionsService,
    private readonly events: ConversationEventsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private conversationsService(): ConversationsService {
    return this.moduleRef.get(ConversationsService, { strict: false });
  }

  async getPendingForOwner(
    ownerId: number,
    conversationId: number,
  ): Promise<ConversationFollowUpResponseDto | null> {
    const conversation = await this.requireConversation(
      ownerId,
      conversationId,
    );
    const row = await this.findPending(
      conversation.workspaceId,
      conversation.id,
    );
    return row ? this.toResponse(row) : null;
  }

  async createForOwner(
    ownerId: number,
    conversationId: number,
    dto: CreateConversationFollowUpDto,
  ): Promise<ConversationFollowUpResponseDto> {
    const conversation = await this.requireConversation(
      ownerId,
      conversationId,
    );
    await this.assertCanWrite(ownerId, conversation);

    const existing = await this.findPending(
      conversation.workspaceId,
      conversation.id,
    );
    if (existing) {
      throw new ConflictException(
        "A pending follow-up already exists for this conversation. Update or cancel it first.",
      );
    }

    const scheduledAt = this.parseFutureScheduledAt(dto.scheduledAt);
    const message = dto.message.trim();
    if (!message) {
      throw new BadRequestException("message must not be empty");
    }

    const row = await this.followUpRepo.save(
      this.followUpRepo.create({
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        status: ConversationFollowUpStatus.pending,
        scheduledAt,
        message,
        templateId: dto.templateId ?? null,
        cancelOnReply: dto.cancelOnReply ?? true,
        previousGroupId: conversation.groupId,
        createdById: ownerId,
        updatedById: ownerId,
      }),
    );

    await this.events.append(
      conversation,
      ConversationEventType.FOLLOW_UP_CREATED,
      ownerId,
      {
        followUpId: row.id,
        scheduledAt: row.scheduledAt.toISOString(),
        messagePreview: truncatePreview(row.message),
        templateId: row.templateId,
        cancelOnReply: row.cancelOnReply,
        previousGroupId: row.previousGroupId,
      },
    );

    return this.toResponse(row);
  }

  async updateForOwner(
    ownerId: number,
    conversationId: number,
    dto: UpdateConversationFollowUpDto,
  ): Promise<ConversationFollowUpResponseDto> {
    const conversation = await this.requireConversation(
      ownerId,
      conversationId,
    );
    await this.assertCanWrite(ownerId, conversation);

    const row = await this.findPending(
      conversation.workspaceId,
      conversation.id,
    );
    if (!row) {
      throw new NotFoundException("No pending follow-up for this conversation");
    }

    const from = {
      scheduledAt: row.scheduledAt.toISOString(),
      messagePreview: truncatePreview(row.message),
      templateId: row.templateId,
      cancelOnReply: row.cancelOnReply,
    };

    if (dto.scheduledAt !== undefined) {
      row.scheduledAt = this.parseFutureScheduledAt(dto.scheduledAt);
    }
    if (dto.message !== undefined) {
      const message = dto.message.trim();
      if (!message) {
        throw new BadRequestException("message must not be empty");
      }
      row.message = message;
    }
    if (dto.templateId !== undefined) {
      row.templateId = dto.templateId;
    }
    if (dto.cancelOnReply !== undefined) {
      row.cancelOnReply = dto.cancelOnReply;
    }
    row.updatedById = ownerId;

    const saved = await this.followUpRepo.save(row);

    await this.events.append(
      conversation,
      ConversationEventType.FOLLOW_UP_CHANGED,
      ownerId,
      {
        followUpId: saved.id,
        from,
        to: {
          scheduledAt: saved.scheduledAt.toISOString(),
          messagePreview: truncatePreview(saved.message),
          templateId: saved.templateId,
          cancelOnReply: saved.cancelOnReply,
        },
      },
    );

    return this.toResponse(saved);
  }

  async cancelForOwner(
    ownerId: number,
    conversationId: number,
  ): Promise<ConversationFollowUpResponseDto> {
    const conversation = await this.requireConversation(
      ownerId,
      conversationId,
    );
    await this.assertCanWrite(ownerId, conversation);

    const row = await this.findPending(
      conversation.workspaceId,
      conversation.id,
    );
    if (!row) {
      throw new NotFoundException("No pending follow-up for this conversation");
    }

    return this.declineFollowUp(
      row,
      conversation,
      FollowUpCancelReason.MANUAL,
      ownerId,
    );
  }

  async cancelOnCustomerReply(conversation: Conversation): Promise<void> {
    const pending = await this.followUpRepo.find({
      where: {
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        status: ConversationFollowUpStatus.pending,
        cancelOnReply: true,
      },
    });
    for (const row of pending) {
      await this.declineFollowUp(
        row,
        conversation,
        FollowUpCancelReason.CUSTOMER_REPLY,
        null,
      );
    }
  }

  async processDueJobs(limit = 50): Promise<number> {
    const due = await this.followUpRepo
      .createQueryBuilder("f")
      .where("f.status = :status", {
        status: ConversationFollowUpStatus.pending,
      })
      .andWhere("f.scheduled_at <= :now", { now: new Date() })
      .orderBy("f.scheduled_at", "ASC")
      .addOrderBy("f.id", "ASC")
      .take(limit)
      .getMany();

    let processed = 0;
    for (const row of due) {
      await this.sendFollowUp(row);
      processed += 1;
    }
    return processed;
  }

  private async sendFollowUp(row: ConversationFollowUp): Promise<void> {
    const conversation = await this.conversationRepo.findOne({
      where: { workspaceId: row.workspaceId, id: row.conversationId },
    });
    if (!conversation) {
      row.status = ConversationFollowUpStatus.cancelled;
      row.cancelReason = FollowUpCancelReason.CONVERSATION_DELETED;
      await this.followUpRepo.save(row);
      return;
    }

    const workspace = await this.workspaceRepo.findOne({
      where: { id: row.workspaceId },
    });
    if (!workspace) {
      row.status = ConversationFollowUpStatus.failed;
      row.errorCode = "WORKSPACE_NOT_FOUND";
      row.errorMessage = "Workspace not found";
      await this.followUpRepo.save(row);
      return;
    }

    const message = row.message.trim();
    if (!message) {
      row.status = ConversationFollowUpStatus.failed;
      row.errorCode = "EMPTY_MESSAGE";
      row.errorMessage = "Follow-up message is empty";
      await this.followUpRepo.save(row);
      return;
    }

    try {
      await this.conversationsService().sendMessageForConversation(
        workspace.ownerId,
        String(conversation.id),
        message,
      );

      row.status = ConversationFollowUpStatus.sent;
      row.sentAt = new Date();
      await this.followUpRepo.save(row);

      await this.events.append(
        conversation,
        ConversationEventType.FOLLOW_UP_APPLIED,
        row.createdById,
        {
          followUpId: row.id,
          scheduledAt: row.scheduledAt.toISOString(),
          messagePreview: truncatePreview(message),
          sentAt: row.sentAt.toISOString(),
          templateId: row.templateId,
        },
      );

      this.log.log(
        `Follow-up applied id=${row.id} conversation=${conversation.id}`,
      );
    } catch (error) {
      const errMessage =
        error instanceof Error ? error.message : "Send follow-up failed";
      row.status = ConversationFollowUpStatus.failed;
      row.errorCode = "SEND_FAILED";
      row.errorMessage = errMessage;
      await this.followUpRepo.save(row);
      this.log.error(
        `Follow-up failed id=${row.id} conversation=${conversation.id}: ${errMessage}`,
      );
    }
  }

  private async declineFollowUp(
    row: ConversationFollowUp,
    conversation: Conversation,
    reason: string,
    actorId: number | null,
  ): Promise<ConversationFollowUpResponseDto> {
    row.status = ConversationFollowUpStatus.cancelled;
    row.cancelReason = reason;
    row.updatedById = actorId ?? row.updatedById;
    const saved = await this.followUpRepo.save(row);

    await this.events.append(
      conversation,
      ConversationEventType.FOLLOW_UP_DECLINED,
      actorId,
      {
        followUpId: saved.id,
        reason,
        scheduledAt: saved.scheduledAt.toISOString(),
        messagePreview: truncatePreview(saved.message),
        templateId: saved.templateId,
        previousGroupId: saved.previousGroupId,
      },
    );

    this.log.log(
      `Follow-up declined id=${saved.id} conversation=${conversation.id} reason=${reason}`,
    );

    return this.toResponse(saved);
  }

  private async findPending(
    workspaceId: number,
    conversationId: number,
  ): Promise<ConversationFollowUp | null> {
    return this.followUpRepo.findOne({
      where: {
        workspaceId,
        conversationId,
        status: ConversationFollowUpStatus.pending,
      },
    });
  }

  private async requireConversation(
    ownerId: number,
    conversationId: number,
  ): Promise<Conversation> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const row = await this.conversationRepo.findOne({
      where: { workspaceId: workspace.id, id: conversationId },
    });
    if (!row) {
      throw new NotFoundException("Conversation not found");
    }
    return row;
  }

  private async assertCanWrite(
    ownerId: number,
    conversation: Conversation,
  ): Promise<void> {
    const permissions = await this.workspacePermissions.getResolvedForUser(
      ownerId,
      undefined,
      conversation.workspaceId,
    );
    if (permissions.isOwner || permissions.conversations.fullAccess) {
      return;
    }
    throw new ForbiddenException(
      "Missing permission to write on this conversation",
    );
  }

  private parseFutureScheduledAt(raw: string): Date {
    const at = new Date(raw);
    if (Number.isNaN(at.getTime())) {
      throw new BadRequestException("scheduledAt must be a valid ISO datetime");
    }
    if (at.getTime() < Date.now() - 60_000) {
      throw new BadRequestException("scheduledAt must be in the future");
    }
    return at;
  }

  private toResponse(
    row: ConversationFollowUp,
  ): ConversationFollowUpResponseDto {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      conversationId: row.conversationId,
      status: row.status,
      scheduledAt: row.scheduledAt,
      message: row.message,
      templateId: row.templateId,
      cancelOnReply: row.cancelOnReply,
      previousGroupId: row.previousGroupId,
      createdById: row.createdById,
      updatedById: row.updatedById,
      cancelReason: row.cancelReason,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      sentAt: row.sentAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

function truncatePreview(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MESSAGE_PREVIEW_MAX) {
    return trimmed;
  }
  return `${trimmed.slice(0, MESSAGE_PREVIEW_MAX)}…`;
}
