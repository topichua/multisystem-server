import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  NovaPoshtaIntegration,
  Order,
  OrderDeliveryInfo,
  OrderEvent,
  OrderStatus,
  WorkspaceMember,
} from "../database/entities";
import { InventoryModule } from "../inventory/inventory.module";
import { WorkspaceAccessModule } from "../workspace-access/workspace-access.module";
import { DeliveryStatusService } from "./delivery-status.service";
import { DevDeliverySimulatorGuard } from "./dev-delivery-simulator.guard";

@Module({
  imports: [
    WorkspaceAccessModule,
    InventoryModule,
    TypeOrmModule.forFeature([
      OrderDeliveryInfo,
      Order,
      NovaPoshtaIntegration,
      OrderStatus,
      OrderEvent,
      WorkspaceMember,
    ]),
  ],
  providers: [DeliveryStatusService, DevDeliverySimulatorGuard],
  exports: [DeliveryStatusService, DevDeliverySimulatorGuard],
})
export class DeliveryModule {}
