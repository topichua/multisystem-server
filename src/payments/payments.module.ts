import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  ManualPaymentMethod,
  Order,
  OrderEvent,
  OrderRefund,
  PaymentIntegration,
  PaymentRequest,
  PaymentTransaction,
} from "../database/entities";
import { WorkspaceAccessModule } from "../workspace-access/workspace-access.module";
import { OrderStatusAutomationsModule } from "../order-status-automations/order-status-automations.module";
import { CredentialsEncryptionService } from "./encryption/credentials-encryption.service";
import { ManualPaymentMethodsController } from "./manual-payment-methods.controller";
import { ManualPaymentMethodsService } from "./manual-payment-methods.service";
import { MonobankOrderPaymentWebhookController } from "./monobank-order-payment-webhook.controller";
import { MonobankApiClient } from "./providers/monobank/monobank-api.client";
import { OrderPaymentsController } from "./order-payments.controller";
import { OrderPaymentsService } from "./order-payments.service";
import { OrderRefundsController } from "./order-refunds.controller";
import { OrderRefundsService } from "./order-refunds.service";
import { PaymentDomainService } from "./payment-domain.service";
import { PaymentIntegrationsController } from "./payment-integrations.controller";
import { PaymentIntegrationsService } from "./payment-integrations.service";
import { PaymentProviderFactory } from "./providers/payment-provider.factory";
import { OrderPaymentStatusApplicationService } from "./order-payment-status-application.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentIntegration,
      PaymentRequest,
      PaymentTransaction,
      ManualPaymentMethod,
      Order,
      OrderEvent,
      OrderRefund,
    ]),
    forwardRef(() => WorkspaceAccessModule),
    forwardRef(() => OrderStatusAutomationsModule),
  ],
  controllers: [
    PaymentIntegrationsController,
    ManualPaymentMethodsController,
    OrderPaymentsController,
    OrderRefundsController,
    MonobankOrderPaymentWebhookController,
  ],
  providers: [
    CredentialsEncryptionService,
    MonobankApiClient,
    PaymentProviderFactory,
    PaymentDomainService,
    OrderPaymentStatusApplicationService,
    PaymentIntegrationsService,
    ManualPaymentMethodsService,
    OrderPaymentsService,
    OrderRefundsService,
  ],
  exports: [
    PaymentIntegrationsService,
    ManualPaymentMethodsService,
    OrderPaymentsService,
    OrderRefundsService,
    PaymentDomainService,
    OrderPaymentStatusApplicationService,
  ],
})
export class PaymentsModule {}
