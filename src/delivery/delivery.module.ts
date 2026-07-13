import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Order,
  OrderDeliveryInfo,
  OrderEvent,
  WorkspaceMember,
} from "../database/entities";
import { OrderStatusAutomationsModule } from "../order-status-automations/order-status-automations.module";
import { WorkspaceAccessModule } from "../workspace-access/workspace-access.module";
import { DeliveryStatusService } from "./delivery-status.service";
import { DevDeliverySimulatorGuard } from "./dev-delivery-simulator.guard";
import { OrderDeliveryStatusApplicationService } from "./order-delivery-status-application.service";

@Module({
  imports: [
    forwardRef(() => WorkspaceAccessModule),
    forwardRef(() => OrderStatusAutomationsModule),
    TypeOrmModule.forFeature([
      OrderDeliveryInfo,
      Order,
      OrderEvent,
      WorkspaceMember,
    ]),
  ],
  providers: [
    DeliveryStatusService,
    DevDeliverySimulatorGuard,
    OrderDeliveryStatusApplicationService,
  ],
  exports: [
    DeliveryStatusService,
    DevDeliverySimulatorGuard,
    OrderDeliveryStatusApplicationService,
  ],
})
export class DeliveryModule {}
