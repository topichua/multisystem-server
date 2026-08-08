import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Client,
  Conversation,
  InstagramIntegration,
  Order,
  OrderDeliveryInfo,
  OrderEvent,
  OrderItem,
  OrderStatus,
  OrderStatusAutomation,
  PaymentTransaction,
  Product,
  ProductMedia,
  ProductVariant,
  TelegramIntegration,
  User,
} from "../database/entities";
import { ConversationEventsModule } from "../conversations/conversation-events.module";
import { DeliveryModule } from "../delivery/delivery.module";
import { ExportsModule } from "../exports/exports.module";
import { VariantCustomFieldsModule } from "../variant-custom-fields/variant-custom-fields.module";
import { InventoryModule } from "../inventory/inventory.module";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { NovaPoshtaIntegrationsModule } from "../novaposhta-integrations/novaposhta-integrations.module";
import { PaymentsModule } from "../payments/payments.module";
import { OrderStatusesController } from "./order-statuses.controller";
import { OrderStatusDefaultsModule } from "./order-status-defaults.module";
import { OrderIdAllocationService } from "./order-id-allocation.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { OrderStatusTransitionService } from "./order-status-transition.service";
import { OrderExportHandler } from "./order-export.handler";
import { OrderStatusAutomationsModule } from "../order-status-automations/order-status-automations.module";

@Module({
  imports: [
    VariantCustomFieldsModule,
    InventoryModule,
    WorkspaceSettingsModule,
    ConversationEventsModule,
    ExportsModule,
    forwardRef(() => NovaPoshtaIntegrationsModule),
    OrderStatusDefaultsModule,
    forwardRef(() => DeliveryModule),
    forwardRef(() => PaymentsModule),
    forwardRef(() => OrderStatusAutomationsModule),
    TypeOrmModule.forFeature([
      Client,
      Conversation,
      InstagramIntegration,
      TelegramIntegration,
      OrderStatus,
      OrderStatusAutomation,
      Order,
      OrderItem,
      OrderDeliveryInfo,
      OrderEvent,
      PaymentTransaction,
      Product,
      ProductMedia,
      ProductVariant,
      User,
    ]),
  ],
  controllers: [OrdersController, OrderStatusesController],
  providers: [
    OrdersService,
    OrderIdAllocationService,
    OrderStatusTransitionService,
    OrderExportHandler,
  ],
  exports: [OrdersService, OrderStatusTransitionService, OrderExportHandler],
})
export class OrdersModule {}
