import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Client,
  Conversation,
  Order,
  OrderDeliveryInfo,
  OrderEvent,
  OrderItem,
  OrderStatus,
  Product,
  ProductMedia,
  ProductVariant,
  Workspace,
} from "../database/entities";
import { VariantCustomFieldsModule } from "../variant-custom-fields/variant-custom-fields.module";
import { InventoryModule } from "../inventory/inventory.module";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { NovaPoshtaIntegrationsModule } from "../novaposhta-integrations/novaposhta-integrations.module";
import { OrderStatusesController } from "./order-statuses.controller";
import { OrderStatusDefaultsModule } from "./order-status-defaults.module";
import { OrderIdAllocationService } from "./order-id-allocation.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [
    VariantCustomFieldsModule,
    InventoryModule,
    WorkspaceSettingsModule,
    NovaPoshtaIntegrationsModule,
    OrderStatusDefaultsModule,
    TypeOrmModule.forFeature([
      Client,
      Conversation,
      OrderStatus,
      Order,
      OrderItem,
      OrderDeliveryInfo,
      OrderEvent,
      Product,
      ProductMedia,
      ProductVariant,
    ]),
  ],
  controllers: [OrdersController, OrderStatusesController],
  providers: [OrdersService, OrderIdAllocationService],
  exports: [OrdersService],
})
export class OrdersModule {}
