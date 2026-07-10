import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Conversation,
  ConversationEventType,
  ConversationGroup,
  ConversationGroupSystemKey,
} from "../database/entities";
import { ConversationEventsService } from "./conversation-events.service";
import { ConversationGroupDefaultsService } from "./conversation-group-defaults.service";

export type ConversationWorkflowTrigger =
  | "created"
  | "inbound_message"
  | "outbound_reply"
  | "responsible_assigned"
  | "take"
  | "manual";

@Injectable()
export class ConversationWorkflowService {
  private readonly log = new Logger(ConversationWorkflowService.name);

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationGroup)
    private readonly groupRepo: Repository<ConversationGroup>,
    private readonly groupDefaults: ConversationGroupDefaultsService,
    private readonly events: ConversationEventsService,
  ) {}

  async onConversationCreated(
    conversation: Conversation,
    actorId?: number | null,
  ): Promise<void> {
    await this.setSystemGroup(conversation, ConversationGroupSystemKey.NEW, {
      actorId: actorId ?? null,
      trigger: "created",
    });
  }

  async shouldDropInboundMessage(conversation: Conversation): Promise<boolean> {
    const current = await this.describeGroup(conversation.groupId);
    return current?.systemKey === ConversationGroupSystemKey.SPAM;
  }

  async onInboundCustomerMessage(conversation: Conversation): Promise<void> {
    const current = await this.describeGroup(conversation.groupId);
    if (current?.systemKey === ConversationGroupSystemKey.SPAM) {
      return;
    }
    if (current?.systemKey !== ConversationGroupSystemKey.ARCHIVED) {
      return;
    }
    await this.setSystemGroup(conversation, ConversationGroupSystemKey.NEW, {
      actorId: null,
      trigger: "inbound_message",
    });
  }

  async onOutboundAgentReply(conversation: Conversation): Promise<void> {
    await this.setSystemGroup(
      conversation,
      ConversationGroupSystemKey.PROCESSING,
      {
        actorId: null,
        trigger: "outbound_reply",
      },
    );
  }

  async onResponsibleAssigned(
    conversation: Conversation,
    actorId?: number | null,
  ): Promise<void> {
    if (conversation.responsibleMemberId == null) {
      return;
    }
    const current = await this.describeGroup(conversation.groupId);
    if (current?.systemKey !== ConversationGroupSystemKey.NEW) {
      return;
    }
    await this.setSystemGroup(
      conversation,
      ConversationGroupSystemKey.PROCESSING,
      {
        actorId: actorId ?? null,
        trigger: "responsible_assigned",
      },
    );
  }

  async onManualGroupChange(
    conversation: Conversation,
    nextGroupId: number | null,
    actorId: number | null,
  ): Promise<void> {
    if (conversation.groupId === nextGroupId) {
      return;
    }

    const fromGroupId = conversation.groupId;
    const fromMeta = await this.describeGroup(fromGroupId);
    const toMeta = await this.describeGroup(nextGroupId);

    conversation.groupId = nextGroupId;
    await this.conversationRepo.save(conversation);

    await this.events.append(
      conversation.id,
      ConversationEventType.GROUP_CHANGED,
      actorId,
      {
        fromGroupId,
        toGroupId: nextGroupId,
        fromSystemKey: fromMeta?.systemKey ?? null,
        toSystemKey: toMeta?.systemKey ?? null,
        trigger: "manual",
      },
    );

    this.log.log(
      `Conversation group changed id=${conversation.id} ${fromGroupId ?? "null"} → ${nextGroupId ?? "null"} (manual)`,
    );
  }

  async onResponsibleMemberChange(
    conversation: Conversation,
    fromMemberId: number | null,
    toMemberId: number | null,
    actorId: number | null,
  ): Promise<void> {
    if (fromMemberId === toMemberId) {
      return;
    }

    await this.events.append(
      conversation.id,
      ConversationEventType.RESPONSIBLE_CHANGED,
      actorId,
      {
        fromResponsibleMemberId: fromMemberId,
        toResponsibleMemberId: toMemberId,
      },
    );

    if (toMemberId != null) {
      await this.onResponsibleAssigned(conversation, actorId);
      return;
    }
  }

  async onTakeChat(
    conversation: Conversation,
    fromMemberId: number | null,
    actorId: number,
  ): Promise<void> {
    if (fromMemberId !== conversation.responsibleMemberId) {
      await this.events.append(
        conversation.id,
        ConversationEventType.RESPONSIBLE_CHANGED,
        actorId,
        {
          fromResponsibleMemberId: fromMemberId,
          toResponsibleMemberId: conversation.responsibleMemberId,
        },
      );
    }

    await this.onResponsibleAssigned(conversation, actorId);
  }

  private async setSystemGroup(
    conversation: Conversation,
    key: ConversationGroupSystemKey,
    meta: { actorId: number | null; trigger: ConversationWorkflowTrigger },
  ): Promise<void> {
    const groupId = await this.groupDefaults.resolveSystemGroupId(
      conversation.workspaceId,
      key,
    );
    if (conversation.groupId === groupId) {
      return;
    }

    const fromGroupId = conversation.groupId;
    const fromMeta = await this.describeGroup(fromGroupId);

    conversation.groupId = groupId;
    await this.conversationRepo.save(conversation);

    await this.events.append(
      conversation.id,
      ConversationEventType.GROUP_CHANGED,
      meta.actorId,
      {
        fromGroupId,
        toGroupId: groupId,
        fromSystemKey: fromMeta?.systemKey ?? null,
        toSystemKey: key,
        trigger: meta.trigger,
      },
    );

    this.log.log(
      `Conversation auto-status id=${conversation.id} → ${key} (trigger=${meta.trigger})`,
    );
  }

  private async describeGroup(
    groupId: number | null,
  ): Promise<Pick<ConversationGroup, "id" | "systemKey"> | null> {
    if (groupId == null) {
      return null;
    }
    return this.groupRepo.findOne({
      where: { id: groupId },
      select: { id: true, systemKey: true },
    });
  }
}
