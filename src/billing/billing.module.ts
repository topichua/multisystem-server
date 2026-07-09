import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  InstagramIntegration,
  TelegramIntegration,
} from "../database/entities";
import { Invoice } from "../database/entities/invoice.entity";
import { PlanTemplate } from "../database/entities/plan-template.entity";
import { SubscriptionChange } from "../database/entities/subscription-change.entity";
import { WorkspaceEntitlements } from "../database/entities/workspace-entitlements.entity";
import { WorkspaceSubscription } from "../database/entities/workspace-subscription.entity";
import { BillingProvisioningModule } from "./billing-provisioning.module";
import {
  BillingAdminController,
  BillingPlansController,
  WorkspaceBillingController,
} from "./billing.controller";
import { EntitlementsService } from "./entitlements.service";
import { InvoicesService } from "./invoices.service";
import { PlansService } from "./plans.service";
import { SubscriptionChangeService } from "./subscription-change.service";
import { SubscriptionsService } from "./subscriptions.service";
import { SubscriptionActivationService } from "./subscription-activation.service";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";
import { SubscriptionRenewalService } from "./subscription-renewal.service";
import { BillingDevGuard } from "./billing-dev.guard";
import { MonopayApiService } from "./monopay/monopay-api.service";
import { MonopayPaymentService } from "./monopay/monopay-payment.service";
import { MonopayConfigService } from "./monopay/monopay-config.service";
import { MonopayTestService } from "./monopay/monopay-test.service";
import { MonopayWebhookController } from "./monopay/monopay-webhook.controller";
import { InvoicePaymentService } from "./invoice-payment.service";

@Module({
  imports: [
    ConfigModule,
    BillingProvisioningModule,
    TypeOrmModule.forFeature([
      WorkspaceEntitlements,
      WorkspaceSubscription,
      PlanTemplate,
      SubscriptionChange,
      Invoice,
      InstagramIntegration,
      TelegramIntegration,
    ]),
  ],
  controllers: [
    BillingPlansController,
    WorkspaceBillingController,
    BillingAdminController,
    MonopayWebhookController,
  ],
  providers: [
    EntitlementsService,
    PlansService,
    SubscriptionsService,
    SubscriptionChangeService,
    SubscriptionActivationService,
    SubscriptionLifecycleService,
    SubscriptionRenewalService,
    InvoicePaymentService,
    MonopayApiService,
    MonopayConfigService,
    MonopayTestService,
    MonopayPaymentService,
    InvoicesService,
    BillingDevGuard,
  ],
  exports: [
    BillingProvisioningModule,
    EntitlementsService,
    PlansService,
    SubscriptionsService,
    InvoicesService,
  ],
})
export class BillingModule {}
