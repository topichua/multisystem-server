import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Order,
  PaymentIntegration,
  PaymentRequest,
  PaymentTransaction,
} from "../database/entities";
import { WorkspaceAccessModule } from "../workspace-access/workspace-access.module";
import { CredentialsEncryptionService } from "./encryption/credentials-encryption.service";
import { MonobankOrderPaymentWebhookController } from "./monobank-order-payment-webhook.controller";
import { MonobankApiClient } from "./providers/monobank/monobank-api.client";
import { OrderPaymentsController } from "./order-payments.controller";
import { OrderPaymentsService } from "./order-payments.service";
import { PaymentDomainService } from "./payment-domain.service";
import { PaymentIntegrationsController } from "./payment-integrations.controller";
import { PaymentIntegrationsService } from "./payment-integrations.service";
import { PaymentProviderFactory } from "./providers/payment-provider.factory";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentIntegration,
      PaymentRequest,
      PaymentTransaction,
      Order,
    ]),
    WorkspaceAccessModule,
  ],
  controllers: [
    PaymentIntegrationsController,
    OrderPaymentsController,
    MonobankOrderPaymentWebhookController,
  ],
  providers: [
    CredentialsEncryptionService,
    MonobankApiClient,
    PaymentProviderFactory,
    PaymentDomainService,
    PaymentIntegrationsService,
    OrderPaymentsService,
  ],
  exports: [PaymentIntegrationsService, OrderPaymentsService, PaymentDomainService],
})
export class PaymentsModule {}
