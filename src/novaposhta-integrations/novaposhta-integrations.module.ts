import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  NovaPoshtaIntegration,
  Order,
  OrderDeliveryInfo,
  OrderItem,
} from "../database/entities";
import { DeliveryModule } from "../delivery/delivery.module";
import { OrderStatusAutomationsModule } from "../order-status-automations/order-status-automations.module";
import { NovaPoshtaApiService } from "./novaposhta-api.service";
import { NovaPoshtaIntegrationsController } from "./novaposhta-integrations.controller";
import { NovaPoshtaSearchController } from "./nova-poshta-search.controller";
import { NovaPoshtaIntegrationsService } from "./novaposhta-integrations.service";
import { NovaPoshtaWaybillService } from "./nova-poshta-waybill.service";
import { NovaPoshtaDeliveryTrackingService } from "./nova-poshta-delivery-tracking.service";
import { NovaPoshtaDeliverySyncWorkerService } from "./nova-poshta-delivery-sync-worker.service";
import { DevDeliverySimulatorController } from "./dev-delivery-simulator.controller";

@Module({
  imports: [
    DeliveryModule,
    forwardRef(() => OrderStatusAutomationsModule),
    TypeOrmModule.forFeature([
      NovaPoshtaIntegration,
      Order,
      OrderDeliveryInfo,
      OrderItem,
    ]),
  ],
  controllers: [
    NovaPoshtaIntegrationsController,
    NovaPoshtaSearchController,
    DevDeliverySimulatorController,
  ],
  providers: [
    NovaPoshtaIntegrationsService,
    NovaPoshtaApiService,
    NovaPoshtaWaybillService,
    NovaPoshtaDeliveryTrackingService,
    NovaPoshtaDeliverySyncWorkerService,
  ],
  exports: [
    NovaPoshtaIntegrationsService,
    NovaPoshtaWaybillService,
    NovaPoshtaDeliveryTrackingService,
  ],
})
export class NovaPoshtaIntegrationsModule {}
