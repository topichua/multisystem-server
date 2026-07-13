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
  Product,
  ProductMedia,
  ProductVariant,
  TelegramIntegration,
  User,
  Workspace,
} from "../database/entities";
import { DeliveryModule } from "../delivery/delivery.module";
import { VariantCustomFieldsModule } from "../variant-custom-fields/variant-custom-fields.module";
import { InventoryModule } from "../inventory/inventory.module";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { NovaPoshtaIntegrationsModule } from "../novaposhta-integrations/novaposhta-integrations.module";
import { OrderStatusesController } from "./order-statuses.controller";
import { OrderStatusDefaultsModule } from "./order-status-defaults.module";
import { OrderIdAllocationService } from "./order-id-allocation.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { OrderStatusTransitionService } from "./order-status-transition.service";

@Module({
  imports: [
    VariantCustomFieldsModule,
    InventoryModule,
    WorkspaceSettingsModule,
    forwardRef(() => NovaPoshtaIntegrationsModule),
    OrderStatusDefaultsModule,
    DeliveryModule,
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
  ],
  exports: [OrdersService, OrderStatusTransitionService],
})
export class OrdersModule {}
