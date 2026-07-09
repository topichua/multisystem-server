import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PlanTemplate } from "../database/entities/plan-template.entity";
import { WorkspaceEntitlements } from "../database/entities/workspace-entitlements.entity";
import { WorkspaceSubscription } from "../database/entities/workspace-subscription.entity";
import { BillingProvisioningService } from "./billing-provisioning.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkspaceEntitlements,
      WorkspaceSubscription,
      PlanTemplate,
    ]),
  ],
  providers: [BillingProvisioningService],
  exports: [BillingProvisioningService],
})
export class BillingProvisioningModule {}
