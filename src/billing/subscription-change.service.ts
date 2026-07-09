import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { BillingCycle } from "../database/entities/billing-cycle.enum";
import { InvoiceStatus } from "../database/entities/invoice-status.enum";
import type { InvoiceLinePurpose } from "../database/entities/invoice.entity";
import { Invoice } from "../database/entities/invoice.entity";
import { PlanTemplate } from "../database/entities/plan-template.entity";
import { SubscriptionChangeType } from "../database/entities/subscription-change-type.enum";
import { SubscriptionChange } from "../database/entities/subscription-change.entity";
import { SubscriptionStatus } from "../database/entities/subscription-status.enum";
import { WorkspaceEntitlements } from "../database/entities/workspace-entitlements.entity";
import { WorkspaceSubscription } from "../database/entities/workspace-subscription.entity";
import {
  applySnapshotToEntitlements,
  entitlementsToSnapshot,
} from "./entitlements.mapper";
import {
  billingPeriodBounds,
  nextCreditsResetAt,
} from "./billing-period.util";
import { PlansService } from "./plans.service";
import type { ChangeSubscriptionRequestDto } from "./dto/change-subscription-request.dto";
import type { ChangeSubscriptionResponseDto } from "./dto/change-subscription-response.dto";
import type { WorkspaceEntitlementsSnapshot } from "./types/workspace-entitlements.interface";
import { SubscriptionsService } from "./subscriptions.service";
import { EntitlementsService } from "./entitlements.service";
import { InvoicesService } from "./invoices.service";

const ACTIVE_STATUSES = [
  SubscriptionStatus.trial,
  SubscriptionStatus.active,
  SubscriptionStatus.pastDue,
];

@Injectable()
export class SubscriptionChangeService {
  constructor(
    @InjectRepository(WorkspaceSubscription)
    private readonly subscriptionRepo: Repository<WorkspaceSubscription>,
    @InjectRepository(WorkspaceEntitlements)
    private readonly entitlementsRepo: Repository<WorkspaceEntitlements>,
    @InjectRepository(SubscriptionChange)
    private readonly changeRepo: Repository<SubscriptionChange>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    private readonly plans: PlansService,
    private readonly subscriptions: SubscriptionsService,
    private readonly entitlements: EntitlementsService,
    private readonly invoices: InvoicesService,
  ) {}

  async changeForWorkspace(
    workspaceId: number,
    userId: number,
    dto: ChangeSubscriptionRequestDto,
  ): Promise<ChangeSubscriptionResponseDto> {
    const billingCycle = dto.billingCycle ?? BillingCycle.monthly;
    let targetPlan: PlanTemplate | null = null;
    let targetEntitlements: WorkspaceEntitlementsSnapshot;

    if (dto.planTemplateId != null) {
      targetPlan = await this.plans.findAccessiblePlan(
        dto.planTemplateId,
        workspaceId,
      );
      if (!targetPlan) {
        throw new NotFoundException("Plan template not found");
      }
      targetEntitlements = targetPlan.entitlements;
    } else if (dto.entitlements) {
      targetEntitlements = dto.entitlements;
    } else {
      throw new BadRequestException(
        "Either planTemplateId or entitlements must be provided",
      );
    }

    const result = await this.subscriptionRepo.manager.transaction(async (em) => {
      const subscription = await em.getRepository(WorkspaceSubscription).findOne({
        where: { workspaceId, status: In(ACTIVE_STATUSES) },
        order: { id: "DESC" },
        lock: { mode: "pessimistic_write" },
      });
      if (!subscription) {
        throw new NotFoundException("Active subscription not found");
      }
      subscription.planTemplate = subscription.planTemplateId
        ? await em.getRepository(PlanTemplate).findOne({
            where: { id: subscription.planTemplateId },
          })
        : null;

      const entitlementsRow = await em
        .getRepository(WorkspaceEntitlements)
        .findOne({
          where: { workspaceId },
          lock: { mode: "pessimistic_write" },
        });
      if (!entitlementsRow) {
        throw new NotFoundException("Workspace entitlements not found");
      }

      const fromSnapshot = entitlementsToSnapshot(entitlementsRow);
      const changeType = this.resolveChangeType(
        subscription,
        targetPlan,
        fromSnapshot,
        targetEntitlements,
        dto.entitlements != null,
      );

      const amount = targetPlan
        ? billingCycle === BillingCycle.yearly
          ? targetPlan.priceYearly
          : targetPlan.priceMonthly
        : 0;

      const purpose: InvoiceLinePurpose =
        changeType === SubscriptionChangeType.renewal
          ? "renewal"
          : changeType === SubscriptionChangeType.downgrade
            ? "downgrade"
            : changeType === SubscriptionChangeType.subscribe
              ? "subscribe"
              : "upgrade";

      let invoice: Invoice | null = null;
      if (amount > 0) {
        const { periodStart, periodEnd } = billingPeriodBounds(
          billingCycle,
          new Date(),
        );
        invoice = await em.getRepository(Invoice).save(
          em.getRepository(Invoice).create({
            workspaceId,
            subscriptionId: subscription.id,
            number: await this.generateInvoiceNumber(workspaceId),
            status: InvoiceStatus.open,
            amount,
            currency: targetPlan?.currency ?? "UAH",
            periodStart,
            periodEnd,
            description: targetPlan
              ? `${targetPlan.name} — ${billingCycle}`
              : "Custom plan",
            lineItems: [
              {
                type: "subscription",
                description: targetPlan?.name ?? "Custom plan",
                amount,
                quantity: 1,
                planTemplateId: targetPlan?.id,
                planSlug: targetPlan?.slug,
                billingCycle,
                purpose,
              },
            ],
            dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            paidAt: null,
            externalPaymentId: null,
          }),
        );

        await em.getRepository(SubscriptionChange).save(
          em.getRepository(SubscriptionChange).create({
            subscriptionId: subscription.id,
            changeType,
            fromEntitlements: fromSnapshot,
            toEntitlements: targetEntitlements,
            invoiceId: invoice.id,
            createdByUserId: userId,
          }),
        );
      } else {
        const { periodStart, periodEnd } = billingPeriodBounds(
          billingCycle,
          new Date(),
        );
        applySnapshotToEntitlements(entitlementsRow, targetEntitlements);
        entitlementsRow.aiCreditsUsed = 0;
        entitlementsRow.creditsResetAt = nextCreditsResetAt();
        await em.getRepository(WorkspaceEntitlements).save(entitlementsRow);

        subscription.planTemplateId = targetPlan?.id ?? null;
        subscription.entitlementsSnapshot = targetEntitlements;
        subscription.billingCycle = billingCycle;
        subscription.periodStart = periodStart;
        subscription.periodEnd = periodEnd;
        subscription.customLabel =
          targetPlan == null ? dto.customLabel?.trim() ?? "Custom" : null;
        subscription.status = SubscriptionStatus.active;
        subscription.canceledAt = null;
        await em.getRepository(WorkspaceSubscription).save(subscription);

        await em.getRepository(SubscriptionChange).save(
          em.getRepository(SubscriptionChange).create({
            subscriptionId: subscription.id,
            changeType,
            fromEntitlements: fromSnapshot,
            toEntitlements: targetEntitlements,
            invoiceId: null,
            createdByUserId: userId,
          }),
        );
      }

      return { subscription, invoice, pendingPayment: amount > 0 };
    });

    const [entitlementsDto, subscriptionDto] = await Promise.all([
      this.entitlements.getForWorkspace(workspaceId),
      this.subscriptions.getActiveForWorkspace(workspaceId),
    ]);

    return {
      subscription: subscriptionDto,
      entitlements: entitlementsDto,
      invoice: result.invoice
        ? await this.invoices.getForWorkspace(workspaceId, result.invoice.id)
        : null,
      pendingPayment: result.pendingPayment,
    };
  }

  async overrideEntitlementsForWorkspace(
    workspaceId: number,
    userId: number,
    entitlements: WorkspaceEntitlementsSnapshot,
    customLabel?: string,
  ): Promise<ChangeSubscriptionResponseDto> {
    return this.changeForWorkspace(workspaceId, userId, {
      entitlements,
      customLabel,
    });
  }

  private resolveChangeType(
    subscription: WorkspaceSubscription,
    targetPlan: PlanTemplate | null,
    fromSnapshot: WorkspaceEntitlementsSnapshot,
    toSnapshot: WorkspaceEntitlementsSnapshot,
    isCustomOverride: boolean,
  ): SubscriptionChangeType {
    if (isCustomOverride) {
      return SubscriptionChangeType.customOverride;
    }
    const currentPlan = subscription.planTemplate;
    if (!currentPlan && targetPlan) {
      return SubscriptionChangeType.subscribe;
    }
    if (targetPlan && currentPlan) {
      if (targetPlan.sortOrder > currentPlan.sortOrder) {
        return SubscriptionChangeType.upgrade;
      }
      if (targetPlan.sortOrder < currentPlan.sortOrder) {
        return SubscriptionChangeType.downgrade;
      }
      return SubscriptionChangeType.renewal;
    }
    if (JSON.stringify(fromSnapshot) !== JSON.stringify(toSnapshot)) {
      return SubscriptionChangeType.customOverride;
    }
    return SubscriptionChangeType.renewal;
  }

  private async generateInvoiceNumber(workspaceId: number): Promise<string> {
    const year = new Date().getUTCFullYear();
    const count = await this.invoiceRepo.count();
    return `INV-${year}-${workspaceId}-${String(count + 1).padStart(6, "0")}`;
  }
}
