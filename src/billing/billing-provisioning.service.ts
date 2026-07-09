import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, IsNull, Repository } from "typeorm";
import { BillingCycle } from "../database/entities/billing-cycle.enum";
import { PlanTemplate } from "../database/entities/plan-template.entity";
import { SubscriptionStatus } from "../database/entities/subscription-status.enum";
import { WorkspaceEntitlements } from "../database/entities/workspace-entitlements.entity";
import { WorkspaceSubscription } from "../database/entities/workspace-subscription.entity";
import { DEFAULT_FREE_PLAN_SLUG } from "./types/default-plan-templates";
import { applySnapshotToEntitlements } from "./entitlements.mapper";
import {
  billingPeriodBounds,
  nextCreditsResetAt,
} from "./billing-period.util";

@Injectable()
export class BillingProvisioningService {
  constructor(
    @InjectRepository(WorkspaceEntitlements)
    private readonly entitlementsRepo: Repository<WorkspaceEntitlements>,
    @InjectRepository(WorkspaceSubscription)
    private readonly subscriptionRepo: Repository<WorkspaceSubscription>,
    @InjectRepository(PlanTemplate)
    private readonly planTemplateRepo: Repository<PlanTemplate>,
  ) {}

  async ensureForWorkspace(
    workspaceId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const em = manager ?? this.entitlementsRepo.manager;
    const entRepo = em.getRepository(WorkspaceEntitlements);
    const existing = await entRepo.exist({ where: { workspaceId } });
    if (existing) {
      return;
    }

    const freePlan = await em.getRepository(PlanTemplate).findOne({
      where: { slug: DEFAULT_FREE_PLAN_SLUG, workspaceId: IsNull() },
    });
    if (!freePlan) {
      throw new InternalServerErrorException("Free plan template is not configured");
    }

    const entitlements = entRepo.create({ workspaceId });
    applySnapshotToEntitlements(entitlements, freePlan.entitlements);
    entitlements.aiCreditsUsed = 0;
    entitlements.creditsResetAt = nextCreditsResetAt();
    await entRepo.save(entitlements);

    const subRepo = em.getRepository(WorkspaceSubscription);
    const activeExists = await subRepo.exist({
      where: [
        { workspaceId, status: SubscriptionStatus.trial },
        { workspaceId, status: SubscriptionStatus.active },
        { workspaceId, status: SubscriptionStatus.pastDue },
      ],
    });
    if (activeExists) {
      return;
    }

    const { periodStart, periodEnd } = billingPeriodBounds(BillingCycle.monthly);
    await subRepo.save(
      subRepo.create({
        workspaceId,
        planTemplateId: freePlan.id,
        status: SubscriptionStatus.active,
        entitlementsSnapshot: freePlan.entitlements,
        billingCycle: BillingCycle.monthly,
        periodStart,
        periodEnd,
        customLabel: null,
        canceledAt: null,
      }),
    );
  }
}
