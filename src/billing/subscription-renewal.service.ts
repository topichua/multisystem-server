import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { BillingCycle } from "../database/entities/billing-cycle.enum";
import { InvoiceStatus } from "../database/entities/invoice-status.enum";
import { Invoice } from "../database/entities/invoice.entity";
import type { InvoiceLinePurpose } from "../database/entities/invoice.entity";
import { SubscriptionChangeType } from "../database/entities/subscription-change-type.enum";
import { SubscriptionChange } from "../database/entities/subscription-change.entity";
import { SubscriptionStatus } from "../database/entities/subscription-status.enum";
import { WorkspaceSubscription } from "../database/entities/workspace-subscription.entity";
import { billingPeriodFrom } from "./billing-period.util";
import { DEFAULT_FREE_PLAN_SLUG } from "./types/default-plan-templates";
import { InvoicesService } from "./invoices.service";
import type { RenewSubscriptionResponseDto } from "./dto/renew-subscription-response.dto";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";

const ACTIVE_STATUSES = [
  SubscriptionStatus.trial,
  SubscriptionStatus.active,
  SubscriptionStatus.pastDue,
];

@Injectable()
export class SubscriptionRenewalService {
  constructor(
    @InjectRepository(WorkspaceSubscription)
    private readonly subscriptionRepo: Repository<WorkspaceSubscription>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(SubscriptionChange)
    private readonly changeRepo: Repository<SubscriptionChange>,
    private readonly invoices: InvoicesService,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

  async createRenewalInvoice(
    workspaceId: number,
    userId: number,
  ): Promise<RenewSubscriptionResponseDto> {
    await this.lifecycle.syncExpiredSubscription(workspaceId);

    const subscription = await this.subscriptionRepo.findOne({
      where: { workspaceId, status: In(ACTIVE_STATUSES) },
      relations: ["planTemplate"],
      order: { id: "DESC" },
    });
    if (!subscription?.planTemplate) {
      throw new NotFoundException("Active subscription not found");
    }
    if (subscription.planTemplate.slug === DEFAULT_FREE_PLAN_SLUG) {
      throw new BadRequestException(
        "Free plan has no renewal; use subscription/change to pick a paid plan",
      );
    }

    const existingOpen = await this.invoiceRepo.findOne({
      where: {
        workspaceId,
        subscriptionId: subscription.id,
        status: InvoiceStatus.open,
      },
      order: { id: "DESC" },
    });
    if (existingOpen) {
      throw new ConflictException(
        "An open invoice already exists for this subscription",
      );
    }

    const billingCycle = subscription.billingCycle;
    const plan = subscription.planTemplate;
    const amount =
      billingCycle === BillingCycle.yearly
        ? plan.priceYearly
        : plan.priceMonthly;
    const previewStart =
      subscription.periodEnd.getTime() > Date.now()
        ? subscription.periodEnd
        : new Date();
    const { periodEnd } = billingPeriodFrom(billingCycle, previewStart);
    const purpose: InvoiceLinePurpose = "renewal";

    const result = await this.subscriptionRepo.manager.transaction(
      async (em) => {
        const invoice = await em.getRepository(Invoice).save(
          em.getRepository(Invoice).create({
            workspaceId,
            subscriptionId: subscription.id,
            number: await this.generateInvoiceNumber(workspaceId),
            status: InvoiceStatus.open,
            amount,
            currency: plan.currency,
            periodStart: previewStart,
            periodEnd,
            description: `${plan.name} — renewal (${billingCycle})`,
            lineItems: [
              {
                type: "subscription",
                description: `${plan.name} — renewal`,
                amount,
                quantity: 1,
                planTemplateId: plan.id,
                planSlug: plan.slug,
                billingCycle,
                purpose,
              },
            ],
            dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            paidAt: null,
            externalPaymentId: null,
          }),
        );

        const entitlementsRow = await em
          .getRepository(WorkspaceSubscription)
          .findOne({ where: { id: subscription.id } });
        if (!entitlementsRow) {
          throw new NotFoundException("Subscription not found");
        }

        await em.getRepository(SubscriptionChange).save(
          em.getRepository(SubscriptionChange).create({
            subscriptionId: subscription.id,
            changeType: SubscriptionChangeType.renewal,
            fromEntitlements: subscription.entitlementsSnapshot,
            toEntitlements: plan.entitlements,
            invoiceId: invoice.id,
            createdByUserId: userId,
          }),
        );

        return invoice;
      },
    );

    return {
      invoice: await this.invoices.getForWorkspace(workspaceId, result.id),
      message:
        "Renewal invoice created. Pay manually to extend the subscription period.",
    };
  }

  private async generateInvoiceNumber(workspaceId: number): Promise<string> {
    const year = new Date().getUTCFullYear();
    const count = await this.invoiceRepo.count();
    return `INV-${year}-${workspaceId}-${String(count + 1).padStart(6, "0")}`;
  }
}
