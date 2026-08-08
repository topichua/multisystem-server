import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Conversation,
  ConversationGroup,
  Order,
  OrderDeliveryInfo,
  OrderStatus,
  OrderStatusAutomation,
  OrderStatusAutomationCondition,
  OrderStatusAutomationExecution,
} from "../database/entities";
import { ConversationGroupDefaultsModule } from "../conversations/conversation-group-defaults.module";
import { ConversationWorkflowModule } from "../conversations/conversation-workflow.module";
import { InventoryModule } from "../inventory/inventory.module";
import { OrdersModule } from "../orders/orders.module";
import { DeliveryModule } from "../delivery/delivery.module";
import { OrderStatusDefaultsModule } from "../orders/order-status-defaults.module";
import { PaymentsModule } from "../payments/payments.module";
import { WorkspaceAccessModule } from "../workspace-access/workspace-access.module";
import { OrderStatusAutomationDefaultsService } from "./order-status-automation-defaults.service";
import { OrderStatusAutomationExecutorService } from "./order-status-automation-executor.service";
import { OrderStatusAutomationTriggerService } from "./order-status-automation-trigger.service";
import { OrderStatusAutomationsController } from "./order-status-automations.controller";
import { OrderStatusAutomationsService } from "./order-status-automations.service";

@Module({
  imports: [
    forwardRef(() => WorkspaceAccessModule),
    InventoryModule,
    forwardRef(() => OrdersModule),
    OrderStatusDefaultsModule,
    ConversationGroupDefaultsModule,
    ConversationWorkflowModule,
    forwardRef(() => DeliveryModule),
    forwardRef(() => PaymentsModule),
    TypeOrmModule.forFeature([
      OrderStatusAutomation,
      OrderStatusAutomationCondition,
      OrderStatusAutomationExecution,
      OrderStatus,
      Order,
      OrderDeliveryInfo,
      Conversation,
      ConversationGroup,
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
    OrderStatusAutomationExecutorService,
  ],
})
export class OrderStatusAutomationsModule {}
