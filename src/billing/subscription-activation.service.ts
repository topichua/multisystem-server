import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { BillingCycle } from "../database/entities/billing-cycle.enum";
import { Invoice } from "../database/entities/invoice.entity";
import type { InvoiceLineItem } from "../database/entities/invoice.entity";
import { PlanTemplate } from "../database/entities/plan-template.entity";
import { SubscriptionChange } from "../database/entities/subscription-change.entity";
import { SubscriptionStatus } from "../database/entities/subscription-status.enum";
import { WorkspaceEntitlements } from "../database/entities/workspace-entitlements.entity";
import { WorkspaceSubscription } from "../database/entities/workspace-subscription.entity";
import { applySnapshotToEntitlements } from "./entitlements.mapper";
import { billingPeriodFrom } from "./billing-period.util";
import { nextCreditsResetAt } from "./billing-period.util";
import { DEFAULT_FREE_PLAN_SLUG } from "./types/default-plan-templates";

@Injectable()
export class SubscriptionActivationService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(SubscriptionChange)
    private readonly changeRepo: Repository<SubscriptionChange>,
    @InjectRepository(WorkspaceSubscription)
    private readonly subscriptionRepo: Repository<WorkspaceSubscription>,
    @InjectRepository(WorkspaceEntitlements)
    private readonly entitlementsRepo: Repository<WorkspaceEntitlements>,
    @InjectRepository(PlanTemplate)
    private readonly planTemplateRepo: Repository<PlanTemplate>,
  ) {}

  async activatePaidInvoice(invoiceId: number, paidAt: Date): Promise<void> {
    await this.invoiceRepo.manager.transaction(async (em) => {
      const invoice = await em.getRepository(Invoice).findOne({
        where: { id: invoiceId },
        lock: { mode: "pessimistic_write" },
      });
      if (!invoice?.subscriptionId) {
        throw new InternalServerErrorException(
          "Paid invoice is not linked to a subscription",
        );
      }

      const change = await em.getRepository(SubscriptionChange).findOne({
        where: { invoiceId: invoice.id },
        order: { id: "DESC" },
      });
      if (!change) {
        throw new InternalServerErrorException(
          "Subscription change not found for invoice",
        );
      }

      const subscription = await em
        .getRepository(WorkspaceSubscription)
        .findOne({
          where: { id: invoice.subscriptionId },
          lock: { mode: "pessimistic_write" },
        });
      if (!subscription) {
        throw new InternalServerErrorException("Subscription not found");
      }

      const entitlementsRow = await em
        .getRepository(WorkspaceEntitlements)
        .findOne({
          where: { workspaceId: subscription.workspaceId },
          lock: { mode: "pessimistic_write" },
        });
      if (!entitlementsRow) {
        throw new InternalServerErrorException(
          "Workspace entitlements not found",
        );
      }

      const lineItem = this.resolvePrimaryLineItem(invoice.lineItems);
      const billingCycle = this.resolveBillingCycle(lineItem, subscription);
      const planTemplate = await this.resolvePlanTemplate(lineItem, change);

      const periodStart = this.resolvePeriodStart(
        lineItem.purpose,
        subscription.periodEnd,
        paidAt,
      );
      const { periodEnd } = billingPeriodFrom(billingCycle, periodStart);

      applySnapshotToEntitlements(entitlementsRow, change.toEntitlements);
      entitlementsRow.aiCreditsUsed = 0;
      entitlementsRow.creditsResetAt = nextCreditsResetAt(periodStart);
      await em.getRepository(WorkspaceEntitlements).save(entitlementsRow);

      subscription.planTemplateId = planTemplate?.id ?? null;
      subscription.entitlementsSnapshot = change.toEntitlements;
      subscription.billingCycle = billingCycle;
      subscription.periodStart = periodStart;
      subscription.periodEnd = periodEnd;
      subscription.status = SubscriptionStatus.active;
      subscription.canceledAt = null;
      subscription.customLabel =
        planTemplate == null ? subscription.customLabel : null;
      await em.getRepository(WorkspaceSubscription).save(subscription);

      invoice.periodStart = periodStart;
      invoice.periodEnd = periodEnd;
      await em.getRepository(Invoice).save(invoice);
    });
  }

  private resolvePrimaryLineItem(
    lineItems: InvoiceLineItem[],
  ): InvoiceLineItem {
    const item = lineItems[0];
    if (!item) {
      throw new InternalServerErrorException("Invoice has no line items");
    }
    return item;
  }

  private resolveBillingCycle(
    lineItem: InvoiceLineItem,
    subscription: WorkspaceSubscription,
  ): BillingCycle {
    if (lineItem.billingCycle === BillingCycle.yearly) {
      return BillingCycle.yearly;
    }
    if (lineItem.billingCycle === BillingCycle.monthly) {
      return BillingCycle.monthly;
    }
    return subscription.billingCycle;
  }

  private async resolvePlanTemplate(
    lineItem: InvoiceLineItem,
    change: SubscriptionChange,
  ): Promise<PlanTemplate | null> {
    if (lineItem.planTemplateId != null) {
      const plan = await this.planTemplateRepo.findOne({
        where: { id: lineItem.planTemplateId },
      });
      if (plan) {
        return plan;
      }
    }
    if (lineItem.planSlug) {
      const plan = await this.planTemplateRepo.findOne({
        where: { slug: lineItem.planSlug, workspaceId: IsNull() },
      });
      if (plan) {
        return plan;
      }
    }
    if (lineItem.purpose === "renewal") {
      const subscription = await this.subscriptionRepo.findOne({
        where: { id: change.subscriptionId },
        relations: ["planTemplate"],
      });
      return subscription?.planTemplate ?? null;
    }
    return null;
  }

  private resolvePeriodStart(
    purpose: InvoiceLineItem["purpose"],
    currentPeriodEnd: Date,
    paidAt: Date,
  ): Date {
    if (purpose === "renewal") {
      return currentPeriodEnd.getTime() > paidAt.getTime()
        ? new Date(currentPeriodEnd)
        : paidAt;
    }
    return paidAt;
  }
}
