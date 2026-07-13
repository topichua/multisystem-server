import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository } from "typeorm";
import {
  InstagramIntegration,
  TelegramIntegration,
  TelegramIntegrationStatus,
} from "../database/entities";
import { WorkspaceEntitlements } from "../database/entities/workspace-entitlements.entity";
import type { WorkspaceEntitlementsUsage } from "./types/workspace-entitlements.interface";
import { entitlementsToSnapshot } from "./entitlements.mapper";
import type { WorkspaceEntitlementsResponseDto } from "./dto/workspace-entitlements-response.dto";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";

@Injectable()
export class EntitlementsService {
  constructor(
    @InjectRepository(WorkspaceEntitlements)
    private readonly entitlementsRepo: Repository<WorkspaceEntitlements>,
    @InjectRepository(InstagramIntegration)
    private readonly instagramRepo: Repository<InstagramIntegration>,
    @InjectRepository(TelegramIntegration)
    private readonly telegramRepo: Repository<TelegramIntegration>,
    private readonly lifecycle: SubscriptionLifecycleService,
  ) {}

  async getForWorkspace(
    workspaceId: number,
  ): Promise<WorkspaceEntitlementsResponseDto> {
    await this.lifecycle.syncExpiredSubscription(workspaceId);
    const row = await this.requireEntitlements(workspaceId);
    const usage = await this.loadUsage(workspaceId);
    const snapshot = entitlementsToSnapshot(row);
    return {
      ...snapshot,
      aiCreditsUsed: row.aiCreditsUsed,
      aiCreditsPurchased: row.aiCreditsPurchased,
      creditsResetAt: row.creditsResetAt?.toISOString() ?? null,
      usage,
    };
  }

  async requireEntitlements(
    workspaceId: number,
  ): Promise<WorkspaceEntitlements> {
    const row = await this.entitlementsRepo.findOne({
      where: { workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Workspace entitlements not found");
    }
    return row;
  }

  async loadUsage(workspaceId: number): Promise<WorkspaceEntitlementsUsage> {
    const [socialAccounts, privateAccounts] = await Promise.all([
      this.instagramRepo.count({
        where: { workspaceId, accessToken: Not(IsNull()) },
      }),
      this.telegramRepo.count({
        where: { workspaceId, status: TelegramIntegrationStatus.ACTIVE },
      }),
    ]);
    const entitlements = await this.entitlementsRepo.findOne({
      where: { workspaceId },
      select: ["aiCreditsUsed"],
    });
    return {
      socialAccounts,
      privateAccounts,
      aiCreditsUsed: entitlements?.aiCreditsUsed ?? 0,
    };
  }
}
