import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Order,
  OrderDeliveryInfo,
  OrderStatus,
  OrderStatusAutomation,
  OrderStatusAutomationExecution,
} from "../database/entities";
import { InventoryModule } from "../inventory/inventory.module";
import { OrdersModule } from "../orders/orders.module";
import { DeliveryModule } from "../delivery/delivery.module";
import { PaymentsModule } from "../payments/payments.module";
import { WorkspaceAccessModule } from "../workspace-access/workspace-access.module";
import { OrderStatusAutomationDefaultsService } from "./order-status-automation-defaults.service";
import { OrderStatusAutomationExecutorService } from "./order-status-automation-executor.service";
import { OrderStatusAutomationTriggerService } from "./order-status-automation-trigger.service";
import { OrderStatusAutomationsController } from "./order-status-automations.controller";
import { OrderStatusAutomationsService } from "./order-status-automations.service";

@Module({
  imports: [
    WorkspaceAccessModule,
    InventoryModule,
    forwardRef(() => OrdersModule),
    forwardRef(() => DeliveryModule),
    forwardRef(() => PaymentsModule),
    TypeOrmModule.forFeature([
      OrderStatusAutomation,
      OrderStatusAutomationExecution,
      OrderStatus,
      Order,
      OrderDeliveryInfo,
    ]),
  ],
  controllers: [OrderStatusAutomationsController],
  providers: [
    OrderStatusAutomationsService,
    OrderStatusAutomationExecutorService,
    OrderStatusAutomationTriggerService,
    OrderStatusAutomationDefaultsService,
  ],
  exports: [
    OrderStatusAutomationTriggerService,
    OrderStatusAutomationDefaultsService,
    OrderStatusAutomationsService,
  ],
})
export class OrderStatusAutomationsModule {}
