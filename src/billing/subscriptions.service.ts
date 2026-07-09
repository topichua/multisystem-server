import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { InvoiceStatus } from "../database/entities/invoice-status.enum";
import { Invoice } from "../database/entities/invoice.entity";
import { SubscriptionStatus } from "../database/entities/subscription-status.enum";
import { WorkspaceSubscription } from "../database/entities/workspace-subscription.entity";
import { PlansService } from "./plans.service";
import { DEFAULT_FREE_PLAN_SLUG } from "./types/default-plan-templates";
import type { WorkspaceSubscriptionResponseDto } from "./dto/workspace-subscription-response.dto";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";

const ACTIVE_STATUSES = [
  SubscriptionStatus.trial,
  SubscriptionStatus.active,
  SubscriptionStatus.pastDue,
];

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(WorkspaceSubscription)
    private readonly subscriptionRepo: Repository<WorkspaceSubscription>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    private readonly plans: PlansService,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

  async getActiveForWorkspace(
    workspaceId: number,
  ): Promise<WorkspaceSubscriptionResponseDto> {
    await this.lifecycle.syncExpiredSubscription(workspaceId);
    const row = await this.requireActiveSubscription(workspaceId);
    return this.toDto(row);
  }

  async requireActiveSubscription(
    workspaceId: number,
  ): Promise<WorkspaceSubscription> {
    const row = await this.subscriptionRepo.findOne({
      where: {
        workspaceId,
        status: In(ACTIVE_STATUSES),
      },
      relations: ["planTemplate"],
      order: { id: "DESC" },
    });
    if (!row) {
      throw new NotFoundException("Active subscription not found");
    }
    return row;
  }

  async toDto(row: WorkspaceSubscription): Promise<WorkspaceSubscriptionResponseDto> {
    const isExpired = this.lifecycle.isSubscriptionExpired(row);
    const isPaidPlan =
      row.planTemplate != null &&
      row.planTemplate.slug !== DEFAULT_FREE_PLAN_SLUG;
    const pendingInvoice = await this.invoiceRepo.findOne({
      where: {
        workspaceId: row.workspaceId,
        subscriptionId: row.id,
        status: InvoiceStatus.open,
      },
      order: { id: "DESC" },
    });

    return {
      id: row.id,
      workspaceId: row.workspaceId,
      planTemplateId: row.planTemplateId,
      plan: row.planTemplate ? this.plans.toDto(row.planTemplate) : null,
      status: row.status,
      entitlementsSnapshot: row.entitlementsSnapshot,
      billingCycle: row.billingCycle,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      customLabel: row.customLabel,
      canceledAt: row.canceledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      manualRenewal: true,
      isExpired,
      canRenew: isPaidPlan,
      pendingInvoice: pendingInvoice
        ? {
            id: pendingInvoice.id,
            number: pendingInvoice.number,
            status: pendingInvoice.status,
            amount: pendingInvoice.amount,
            currency: pendingInvoice.currency,
            periodStart: pendingInvoice.periodStart?.toISOString() ?? null,
            periodEnd: pendingInvoice.periodEnd?.toISOString() ?? null,
            description: pendingInvoice.description,
            paidAt: pendingInvoice.paidAt?.toISOString() ?? null,
            dueAt: pendingInvoice.dueAt?.toISOString() ?? null,
            createdAt: pendingInvoice.createdAt.toISOString(),
          }
        : null,
    };
  }
}
