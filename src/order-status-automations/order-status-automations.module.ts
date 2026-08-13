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
  OrderStatusAutomationScheduledJob,
  Workspace,
} from "../database/entities";
import { ConversationGroupDefaultsModule } from "../conversations/conversation-group-defaults.module";
import { ConversationWorkflowModule } from "../conversations/conversation-workflow.module";
import { ConversationsModule } from "../conversations/conversations.module";
import { InventoryModule } from "../inventory/inventory.module";
import { OrdersModule } from "../orders/orders.module";
import { DeliveryModule } from "../delivery/delivery.module";
import { OrderStatusDefaultsModule } from "../orders/order-status-defaults.module";
import { PaymentsModule } from "../payments/payments.module";
import { WorkspaceAccessModule } from "../workspace-access/workspace-access.module";
import { WorkspaceSettingsModule } from "../workspace-settings/workspace-settings.module";
import { WorkspaceTemplatesModule } from "../workspace-templates/workspace-templates.module";
import { WorkspaceTemplate } from "../workspace-templates/workspace-template.entity";
import { AutomationSendMessageService } from "./automation-send-message.service";
import { AutomationSendMessageWorkerService } from "./automation-send-message-worker.service";
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
    forwardRef(() => ConversationsModule),
    forwardRef(() => DeliveryModule),
    forwardRef(() => PaymentsModule),
    WorkspaceSettingsModule,
    WorkspaceTemplatesModule,
    TypeOrmModule.forFeature([
      OrderStatusAutomation,
      OrderStatusAutomationCondition,
      OrderStatusAutomationExecution,
      OrderStatusAutomationScheduledJob,
      OrderStatus,
      Order,
      OrderDeliveryInfo,
      Conversation,
      ConversationGroup,
      WorkspaceTemplate,
      Workspace,
    ]),
  ],
  controllers: [OrderStatusAutomationsController],
  providers: [
    OrderStatusAutomationsService,
    OrderStatusAutomationExecutorService,
    OrderStatusAutomationTriggerService,
    OrderStatusAutomationDefaultsService,
    AutomationSendMessageService,
    AutomationSendMessageWorkerService,
  ],
  exports: [
    OrderStatusAutomationTriggerService,
    OrderStatusAutomationDefaultsService,
    OrderStatusAutomationsService,
    OrderStatusAutomationExecutorService,
    AutomationSendMessageService,
  ],
})
export class OrderStatusAutomationsModule {}
