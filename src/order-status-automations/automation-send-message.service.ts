import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  AutomationConditionType,
  AutomationDurationUnit,
  AutomationExecutionStatus,
  AutomationScheduledJobStatus,
  AutomationSourceType,
  Conversation,
  Order,
  OrderDeliveryInfo,
  OrderStatusAutomation,
  OrderStatusAutomationExecution,
  OrderStatusAutomationScheduledJob,
  Workspace,
} from "../database/entities";
import { ConversationsService } from "../conversations/conversations.service";
import { WorkspaceSettingsService } from "../workspace-settings/workspace-settings.service";
import { WorkspaceTemplate } from "../workspace-templates/workspace-template.entity";
import { WorkspaceTemplateType } from "../workspace-templates/workspace-template-type.enum";
import { WorkspaceTemplateRenderService } from "../workspace-templates/workspace-template-render.service";
import {
  areAutomationConditionsMatched,
  resolveSourceStatusFromOrder,
  resolveStatusChangedAtFromOrder,
} from "./logic/automation-condition-match.logic";
import { addDuration } from "./logic/automation-duration.logic";
import { AutomationSkipReason } from "./order-status-automation.constants";

const IMMEDIATE_SEND_TOLERANCE_MS = 5_000;
const MESSAGE_PREVIEW_MAX = 500;

export type ScheduleOrSendMessageInput = {
  automation: OrderStatusAutomation;
  order: Order;
  workspaceId: number;
  orderId: number;
  sourceType: AutomationSourceType;
  sourceStatus: string;
  expectedStatusChangedAt: Date;
  timed: boolean;
  durationValue: number | null;
  durationUnit: AutomationDurationUnit | null;
  idempotencyKey: string;
};

@Injectable()
export class AutomationSendMessageService {
  private readonly log = new Logger(AutomationSendMessageService.name);

  private readonly conditionResolver = {
    resolveCurrentSourceStatus: (order: Order, sourceType: AutomationSourceType) =>
      resolveSourceStatusFromOrder(order, sourceType, this.deliveryRepo),
    resolveCurrentStatusChangedAt: (
      order: Order,
      sourceType: AutomationSourceType,
    ) => resolveStatusChangedAtFromOrder(order, sourceType, this.deliveryRepo),
  };

  constructor(
    @InjectRepository(OrderStatusAutomationScheduledJob)
    private readonly jobRepo: Repository<OrderStatusAutomationScheduledJob>,
    @InjectRepository(OrderStatusAutomationExecution)
    private readonly executionRepo: Repository<OrderStatusAutomationExecution>,
    @InjectRepository(OrderStatusAutomation)
    private readonly automationRepo: Repository<OrderStatusAutomation>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderDeliveryInfo)
    private readonly deliveryRepo: Repository<OrderDeliveryInfo>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(WorkspaceTemplate)
    private readonly templateRepo: Repository<WorkspaceTemplate>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    private readonly templateRender: WorkspaceTemplateRenderService,
    private readonly workspaceSettings: WorkspaceSettingsService,
    private readonly conversations: ConversationsService,
  ) {}

  async scheduleOrSend(input: ScheduleOrSendMessageInput): Promise<void> {
    const {
      automation,
      order,
      workspaceId,
      orderId,
      sourceType,
      sourceStatus,
      expectedStatusChangedAt,
      timed,
      durationValue,
      durationUnit,
      idempotencyKey,
    } = input;

    const existingJob = await this.jobRepo.findOne({
      where: { automationId: automation.id, orderId, idempotencyKey },
    });
    if (existingJob) {
      return;
    }

    const templateId = automation.targetTemplateId;
    if (templateId == null) {
      await this.logSkipped({
        automation,
        workspaceId,
        orderId,
        sourceType,
        sourceStatus,
        expectedStatusChangedAt,
        timed,
        durationValue,
        durationUnit,
        idempotencyKey,
        reason: AutomationSkipReason.TARGET_TEMPLATE_MISSING,
      });
      return;
    }

    const template = await this.templateRepo.findOne({
      where: { id: templateId, workspaceId },
    });
    if (!template) {
      await this.logSkipped({
        automation,
        workspaceId,
        orderId,
        sourceType,
        sourceStatus,
        expectedStatusChangedAt,
        timed,
        durationValue,
        durationUnit,
        idempotencyKey,
        reason: AutomationSkipReason.TARGET_TEMPLATE_MISSING,
        targetTemplateId: templateId,
      });
      return;
    }
    if (!template.isActive) {
      await this.logSkipped({
        automation,
        workspaceId,
        orderId,
        sourceType,
        sourceStatus,
        expectedStatusChangedAt,
        timed,
        durationValue,
        durationUnit,
        idempotencyKey,
        reason: AutomationSkipReason.TARGET_TEMPLATE_MISSING,
        targetTemplateId: templateId,
      });
      return;
    }
    if (template.type !== WorkspaceTemplateType.order) {
      await this.logSkipped({
        automation,
        workspaceId,
        orderId,
        sourceType,
        sourceStatus,
        expectedStatusChangedAt,
        timed,
        durationValue,
        durationUnit,
        idempotencyKey,
        reason: AutomationSkipReason.TARGET_TEMPLATE_WRONG_TYPE,
        targetTemplateId: templateId,
      });
      return;
    }

    if (order.conversationId == null) {
      await this.logSkipped({
        automation,
        workspaceId,
        orderId,
        sourceType,
        sourceStatus,
        expectedStatusChangedAt,
        timed,
        durationValue,
        durationUnit,
        idempotencyKey,
        reason: AutomationSkipReason.ORDER_HAS_NO_CONVERSATION,
        targetTemplateId: templateId,
      });
      return;
    }

    const conversation = await this.conversationRepo.findOne({
      where: { workspaceId, id: order.conversationId },
    });
    if (!conversation) {
      await this.logSkipped({
        automation,
        workspaceId,
        orderId,
        sourceType,
        sourceStatus,
        expectedStatusChangedAt,
        timed,
        durationValue,
        durationUnit,
        idempotencyKey,
        reason: AutomationSkipReason.CONVERSATION_NOT_FOUND,
        targetTemplateId: templateId,
      });
      return;
    }

    const runAt = await this.resolveRunAt(automation, workspaceId);
    if (runAt.getTime() <= Date.now() + IMMEDIATE_SEND_TOLERANCE_MS) {
      await this.sendNow({
        automation,
        order,
        conversation,
        template,
        workspaceId,
        orderId,
        sourceType,
        sourceStatus,
        expectedStatusChangedAt,
        timed,
        durationValue,
        durationUnit,
        idempotencyKey,
      });
      return;
    }

    try {
      await this.jobRepo.save(
        this.jobRepo.create({
          workspaceId,
          automationId: automation.id,
          orderId,
          conversationId: conversation.id,
          templateId,
          status: AutomationScheduledJobStatus.pending,
          runAt,
          sourceType,
          sourceStatusSnapshot: sourceStatus,
          expectedStatusChangedAt,
          idempotencyKey,
          automationNameSnapshot: automation.name,
          automationVersion: automation.version,
          actionDelayValue: automation.actionDelayValue,
          actionDelayUnit: automation.actionDelayUnit,
          waitForBusinessHours: automation.waitForBusinessHours,
        }),
      );
      this.log.log(
        `Automation SEND_MESSAGE scheduled id=${automation.id} order=${orderId} runAt=${runAt.toISOString()}`,
      );
    } catch (error) {
      const pgCode = (error as { code?: string })?.code;
      if (pgCode === "23505") {
        return;
      }
      throw error;
    }
  }

  async processDueJobs(limit = 50): Promise<number> {
    const due = await this.jobRepo
      .createQueryBuilder("j")
      .where("j.status = :status", {
        status: AutomationScheduledJobStatus.pending,
      })
      .andWhere("j.run_at <= :now", { now: new Date() })
      .orderBy("j.run_at", "ASC")
      .addOrderBy("j.id", "ASC")
      .take(limit)
      .getMany();

    let processed = 0;
    for (const job of due) {
      await this.processJob(job);
      processed += 1;
    }
    return processed;
  }

  async cancelPendingForAutomation(
    automationId: number,
    reason: string = AutomationSkipReason.AUTOMATION_DISABLED,
    options?: { deleteJobs?: boolean; logSkip?: boolean },
  ): Promise<number> {
    const pending = await this.jobRepo.find({
      where: {
        automationId,
        status: AutomationScheduledJobStatus.pending,
      },
    });
    const deleteJobs = options?.deleteJobs === true;
    const logSkip = options?.logSkip !== false;

    for (const job of pending) {
      if (deleteJobs) {
        await this.jobRepo.remove(job);
        continue;
      }
      await this.cancelJob(job, reason, logSkip);
    }
    return pending.length;
  }

  private async processJob(
    job: OrderStatusAutomationScheduledJob,
  ): Promise<void> {
    const automation = await this.automationRepo.findOne({
      where: { id: job.automationId },
      relations: { conditions: true },
      withDeleted: true,
    });

    if (!automation || automation.deletedAt != null || !automation.isActive) {
      await this.cancelJob(job, AutomationSkipReason.AUTOMATION_DISABLED);
      return;
    }

    if (automation.version !== job.automationVersion) {
      await this.cancelJob(job, AutomationSkipReason.STALE_AUTOMATION_VERSION);
      return;
    }

    const order = await this.orderRepo.findOne({
      where: { workspaceId: job.workspaceId, id: job.orderId },
    });
    if (!order) {
      await this.cancelJob(job, AutomationSkipReason.ORDER_NOT_FOUND);
      return;
    }

    const conditionsOk = await areAutomationConditionsMatched(
      order,
      automation.conditions ?? [],
      automation.conditionType ?? AutomationConditionType.or,
      this.conditionResolver,
    );
    if (!conditionsOk) {
      await this.cancelJob(job, AutomationSkipReason.CONDITIONS_NOT_MATCHED);
      return;
    }

    if (order.conversationId == null) {
      await this.cancelJob(job, AutomationSkipReason.ORDER_HAS_NO_CONVERSATION);
      return;
    }

    const conversation = await this.conversationRepo.findOne({
      where: { workspaceId: job.workspaceId, id: order.conversationId },
    });
    if (!conversation) {
      await this.cancelJob(job, AutomationSkipReason.CONVERSATION_NOT_FOUND);
      return;
    }

    const template = await this.templateRepo.findOne({
      where: { id: job.templateId, workspaceId: job.workspaceId },
    });
    if (
      !template ||
      !template.isActive ||
      template.type !== WorkspaceTemplateType.order
    ) {
      await this.cancelJob(
        job,
        !template || !template.isActive
          ? AutomationSkipReason.TARGET_TEMPLATE_MISSING
          : AutomationSkipReason.TARGET_TEMPLATE_WRONG_TYPE,
      );
      return;
    }

    if (automation.waitForBusinessHours) {
      const nextSlot = await this.workspaceSettings.resolveSendAtForWorkspace(
        job.workspaceId,
        new Date(),
      );
      if (nextSlot.getTime() > Date.now() + IMMEDIATE_SEND_TOLERANCE_MS) {
        job.runAt = nextSlot;
        await this.jobRepo.save(job);
        this.log.log(
          `Automation SEND_MESSAGE job=${job.id} deferred to business hours runAt=${nextSlot.toISOString()}`,
        );
        return;
      }
    }

    await this.sendNow({
      automation,
      order,
      conversation,
      template,
      workspaceId: job.workspaceId,
      orderId: job.orderId,
      sourceType: job.sourceType,
      sourceStatus: job.sourceStatusSnapshot,
      expectedStatusChangedAt: job.expectedStatusChangedAt ?? new Date(),
      timed: true,
      durationValue: job.actionDelayValue,
      durationUnit: job.actionDelayUnit,
      idempotencyKey: job.idempotencyKey,
      job,
    });
  }

  private async sendNow(input: {
    automation: OrderStatusAutomation;
    order: Order;
    conversation: Conversation;
    template: WorkspaceTemplate;
    workspaceId: number;
    orderId: number;
    sourceType: AutomationSourceType;
    sourceStatus: string;
    expectedStatusChangedAt: Date;
    timed: boolean;
    durationValue: number | null;
    durationUnit: AutomationDurationUnit | null;
    idempotencyKey: string;
    job?: OrderStatusAutomationScheduledJob;
  }): Promise<void> {
    const {
      automation,
      conversation,
      template,
      workspaceId,
      orderId,
      sourceType,
      sourceStatus,
      expectedStatusChangedAt,
      durationValue,
      durationUnit,
      idempotencyKey,
      job,
    } = input;

    const existing = await this.executionRepo.findOne({
      where: { automationId: automation.id, orderId, idempotencyKey },
    });
    if (existing) {
      if (job && job.status === AutomationScheduledJobStatus.pending) {
        job.status = AutomationScheduledJobStatus.sent;
        job.executionId = existing.id;
        job.sentAt = existing.executedAt;
        job.messagePreview = existing.messagePreview;
        await this.jobRepo.save(job);
      }
      return;
    }

    let renderedText: string;
    try {
      const rendered = await this.templateRender.render({
        template,
        workspaceId,
        orderId,
      });
      renderedText = rendered.text.trim();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Template render failed";
      await this.failSend({
        automation,
        workspaceId,
        orderId,
        conversationId: conversation.id,
        templateId: template.id,
        sourceType,
        sourceStatus,
        expectedStatusChangedAt,
        durationValue,
        durationUnit,
        idempotencyKey,
        job,
        errorCode: "RENDER_FAILED",
        errorMessage: message,
      });
      return;
    }

    if (!renderedText) {
      await this.logSkipped({
        automation,
        workspaceId,
        orderId,
        sourceType,
        sourceStatus,
        expectedStatusChangedAt,
        timed: input.timed,
        durationValue,
        durationUnit,
        idempotencyKey,
        reason: AutomationSkipReason.EMPTY_RENDERED_MESSAGE,
        targetTemplateId: template.id,
        conversationId: conversation.id,
      });
      if (job) {
        job.status = AutomationScheduledJobStatus.cancelled;
        job.cancelReason = AutomationSkipReason.EMPTY_RENDERED_MESSAGE;
        await this.jobRepo.save(job);
      }
      return;
    }

    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) {
      await this.failSend({
        automation,
        workspaceId,
        orderId,
        conversationId: conversation.id,
        templateId: template.id,
        sourceType,
        sourceStatus,
        expectedStatusChangedAt,
        durationValue,
        durationUnit,
        idempotencyKey,
        job,
        errorCode: "WORKSPACE_NOT_FOUND",
        errorMessage: "Workspace not found",
        messagePreview: truncatePreview(renderedText),
      });
      return;
    }

    try {
      await this.conversations.sendMessageForConversation(
        workspace.ownerId,
        String(conversation.id),
        renderedText,
      );

      const execution = await this.executionRepo.save(
        this.executionRepo.create({
          automationId: automation.id,
          workspaceId,
          orderId,
          status: AutomationExecutionStatus.applied,
          reason: null,
          previousOrderStatusId: null,
          targetOrderStatusId: null,
          previousConversationGroupId: null,
          targetConversationGroupId: null,
          targetTemplateId: template.id,
          conversationId: conversation.id,
          messagePreview: truncatePreview(renderedText),
          sourceType,
          sourceStatusSnapshot: sourceStatus,
          expectedStatusChangedAt,
          idempotencyKey,
          automationNameSnapshot: automation.name,
          durationValue,
          durationUnit,
          executedAt: new Date(),
        }),
      );

      if (job) {
        job.status = AutomationScheduledJobStatus.sent;
        job.executionId = execution.id;
        job.sentAt = execution.executedAt;
        job.messagePreview = execution.messagePreview;
        await this.jobRepo.save(job);
      } else {
        try {
          await this.jobRepo.save(
            this.jobRepo.create({
              workspaceId,
              automationId: automation.id,
              orderId,
              conversationId: conversation.id,
              templateId: template.id,
              status: AutomationScheduledJobStatus.sent,
              runAt: new Date(),
              sourceType,
              sourceStatusSnapshot: sourceStatus,
              expectedStatusChangedAt,
              idempotencyKey,
              automationNameSnapshot: automation.name,
              automationVersion: automation.version,
              actionDelayValue: automation.actionDelayValue,
              actionDelayUnit: automation.actionDelayUnit,
              waitForBusinessHours: automation.waitForBusinessHours,
              messagePreview: execution.messagePreview,
              executionId: execution.id,
              sentAt: execution.executedAt,
            }),
          );
        } catch (dupError) {
          const pgCode = (dupError as { code?: string })?.code;
          if (pgCode !== "23505") {
            throw dupError;
          }
        }
      }

      this.log.log(
        `Automation SEND_MESSAGE applied id=${automation.id} order=${orderId} conversation=${conversation.id}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Send message failed";
      await this.failSend({
        automation,
        workspaceId,
        orderId,
        conversationId: conversation.id,
        templateId: template.id,
        sourceType,
        sourceStatus,
        expectedStatusChangedAt,
        durationValue,
        durationUnit,
        idempotencyKey,
        job,
        errorCode: "SEND_FAILED",
        errorMessage: message,
        messagePreview: truncatePreview(renderedText),
      });
    }
  }

  private async resolveRunAt(
    automation: OrderStatusAutomation,
    workspaceId: number,
  ): Promise<Date> {
    let desiredAt = new Date();
    if (
      automation.actionDelayValue != null &&
      automation.actionDelayUnit != null
    ) {
      desiredAt = addDuration(
        desiredAt,
        automation.actionDelayValue,
        automation.actionDelayUnit,
      );
    }
    if (automation.waitForBusinessHours) {
      return this.workspaceSettings.resolveSendAtForWorkspace(
        workspaceId,
        desiredAt,
      );
    }
    return desiredAt;
  }

  private async cancelJob(
    job: OrderStatusAutomationScheduledJob,
    reason: string,
    logSkip = true,
  ): Promise<void> {
    if (job.status !== AutomationScheduledJobStatus.pending) {
      return;
    }
    job.status = AutomationScheduledJobStatus.cancelled;
    job.cancelReason = reason;
    await this.jobRepo.save(job);

    if (!logSkip) {
      return;
    }

    const automation = await this.automationRepo.findOne({
      where: { id: job.automationId },
      withDeleted: true,
    });
    if (!automation) {
      return;
    }
    await this.logSkipped({
      automation,
      workspaceId: job.workspaceId,
      orderId: job.orderId,
      sourceType: job.sourceType,
      sourceStatus: job.sourceStatusSnapshot,
      expectedStatusChangedAt: job.expectedStatusChangedAt ?? job.createdAt,
      timed: true,
      durationValue: job.actionDelayValue,
      durationUnit: job.actionDelayUnit,
      idempotencyKey: job.idempotencyKey,
      reason,
      targetTemplateId: job.templateId,
      conversationId: job.conversationId,
    });
  }

  private async failSend(input: {
    automation: OrderStatusAutomation;
    workspaceId: number;
    orderId: number;
    conversationId: number;
    templateId: number;
    sourceType: AutomationSourceType;
    sourceStatus: string;
    expectedStatusChangedAt: Date;
    durationValue: number | null;
    durationUnit: AutomationDurationUnit | null;
    idempotencyKey: string;
    job?: OrderStatusAutomationScheduledJob;
    errorCode: string;
    errorMessage: string;
    messagePreview?: string | null;
  }): Promise<void> {
    this.log.error(
      `Automation SEND_MESSAGE failed id=${input.automation.id} order=${input.orderId}: ${input.errorMessage}`,
    );
    try {
      const execution = await this.executionRepo.save(
        this.executionRepo.create({
          automationId: input.automation.id,
          workspaceId: input.workspaceId,
          orderId: input.orderId,
          status: AutomationExecutionStatus.failed,
          reason: AutomationSkipReason.SEND_MESSAGE_FAILED,
          previousOrderStatusId: null,
          targetOrderStatusId: null,
          previousConversationGroupId: null,
          targetConversationGroupId: null,
          targetTemplateId: input.templateId,
          conversationId: input.conversationId,
          messagePreview: input.messagePreview ?? null,
          sourceType: input.sourceType,
          sourceStatusSnapshot: input.sourceStatus,
          expectedStatusChangedAt: input.expectedStatusChangedAt,
          idempotencyKey: input.idempotencyKey,
          automationNameSnapshot: input.automation.name,
          durationValue: input.durationValue,
          durationUnit: input.durationUnit,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          executedAt: new Date(),
        }),
      );
      if (input.job) {
        input.job.status = AutomationScheduledJobStatus.failed;
        input.job.errorCode = input.errorCode;
        input.job.errorMessage = input.errorMessage;
        input.job.executionId = execution.id;
        input.job.messagePreview = input.messagePreview ?? null;
        await this.jobRepo.save(input.job);
      }
    } catch (error) {
      const pgCode = (error as { code?: string })?.code;
      if (pgCode !== "23505") {
        throw error;
      }
    }
  }

  private async logSkipped(input: {
    automation: OrderStatusAutomation;
    workspaceId: number;
    orderId: number;
    sourceType: AutomationSourceType;
    sourceStatus: string;
    expectedStatusChangedAt: Date;
    timed: boolean;
    durationValue: number | null;
    durationUnit: AutomationDurationUnit | null;
    idempotencyKey: string;
    reason: string;
    targetTemplateId?: number | null;
    conversationId?: number | null;
  }): Promise<void> {
    this.log.warn(
      `Automation SEND_MESSAGE skipped id=${input.automation.id} order=${input.orderId} reason=${input.reason}`,
    );
    try {
      await this.executionRepo.save(
        this.executionRepo.create({
          automationId: input.automation.id,
          workspaceId: input.workspaceId,
          orderId: input.orderId,
          status: AutomationExecutionStatus.skipped,
          reason: input.reason,
          previousOrderStatusId: null,
          targetOrderStatusId: null,
          previousConversationGroupId: null,
          targetConversationGroupId: null,
          targetTemplateId: input.targetTemplateId ?? null,
          conversationId: input.conversationId ?? null,
          messagePreview: null,
          sourceType: input.sourceType,
          sourceStatusSnapshot: input.sourceStatus,
          expectedStatusChangedAt: input.expectedStatusChangedAt,
          idempotencyKey: input.idempotencyKey,
          automationNameSnapshot: input.automation.name,
          durationValue: input.durationValue,
          durationUnit: input.durationUnit,
          executedAt: new Date(),
        }),
      );
    } catch (error) {
      const pgCode = (error as { code?: string })?.code;
      if (pgCode !== "23505") {
        throw error;
      }
    }
  }
}

function truncatePreview(text: string): string {
  if (text.length <= MESSAGE_PREVIEW_MAX) {
    return text;
  }
  return `${text.slice(0, MESSAGE_PREVIEW_MAX)}…`;
}
