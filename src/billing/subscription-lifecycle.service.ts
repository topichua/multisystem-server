import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import { PlanTemplate } from "../database/entities/plan-template.entity";
import { SubscriptionStatus } from "../database/entities/subscription-status.enum";
import { WorkspaceEntitlements } from "../database/entities/workspace-entitlements.entity";
import { WorkspaceSubscription } from "../database/entities/workspace-subscription.entity";
import { applySnapshotToEntitlements } from "./entitlements.mapper";
import { DEFAULT_FREE_PLAN_SLUG } from "./types/default-plan-templates";

const ACTIVE_STATUSES = [
  SubscriptionStatus.trial,
  SubscriptionStatus.active,
  SubscriptionStatus.pastDue,
];

@Injectable()
export class SubscriptionLifecycleService {
  constructor(
    @InjectRepository(WorkspaceSubscription)
    private readonly subscriptionRepo: Repository<WorkspaceSubscription>,
    @InjectRepository(WorkspaceEntitlements)
    private readonly entitlementsRepo: Repository<WorkspaceEntitlements>,
    @InjectRepository(PlanTemplate)
    private readonly planTemplateRepo: Repository<PlanTemplate>,
  ) {}

  /** Manual billing: when a paid period ends, revert to Free until user pays again. */
  async syncExpiredSubscription(workspaceId: number): Promise<void> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { workspaceId, status: In(ACTIVE_STATUSES) },
      relations: ["planTemplate"],
      order: { id: "DESC" },
    });
    if (!subscription?.planTemplate) {
      return;
    }
    if (subscription.planTemplate.slug === DEFAULT_FREE_PLAN_SLUG) {
      return;
    }
    if (subscription.periodEnd.getTime() > Date.now()) {
      return;
    }

    const freePlan = await this.planTemplateRepo.findOne({
      where: { slug: DEFAULT_FREE_PLAN_SLUG, workspaceId: IsNull() },
    });
    if (!freePlan) {
      return;
    }

    const entitlements = await this.entitlementsRepo.findOne({
      where: { workspaceId },
    });
    if (!entitlements) {
      return;
    }

    applySnapshotToEntitlements(entitlements, freePlan.entitlements);
    await this.entitlementsRepo.save(entitlements);

    subscription.planTemplateId = freePlan.id;
    subscription.entitlementsSnapshot = freePlan.entitlements;
    subscription.status = SubscriptionStatus.pastDue;
    await this.subscriptionRepo.save(subscription);
  }

  isSubscriptionExpired(subscription: WorkspaceSubscription): boolean {
    if (!subscription.planTemplate) {
      return false;
    }
    if (subscription.planTemplate.slug === DEFAULT_FREE_PLAN_SLUG) {
      return false;
    }
    return subscription.periodEnd.getTime() <= Date.now();
  }
}
