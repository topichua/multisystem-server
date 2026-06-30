import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  NovaPoshtaIntegration,
  Order,
  OrderDeliveryInfo,
  OrderItem,
} from "../database/entities";
import { NovaPoshtaApiService } from "./novaposhta-api.service";
import { NovaPoshtaIntegrationsController } from "./novaposhta-integrations.controller";
import { NovaPoshtaSearchController } from "./nova-poshta-search.controller";
import { NovaPoshtaIntegrationsService } from "./novaposhta-integrations.service";
import { NovaPoshtaWaybillService } from "./nova-poshta-waybill.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NovaPoshtaIntegration,
      Order,
      OrderDeliveryInfo,
      OrderItem,
    ]),
  ],
  controllers: [NovaPoshtaIntegrationsController, NovaPoshtaSearchController],
  providers: [
    NovaPoshtaIntegrationsService,
    NovaPoshtaApiService,
    NovaPoshtaWaybillService,
  ],
  exports: [NovaPoshtaIntegrationsService, NovaPoshtaWaybillService],
})
export class NovaPoshtaIntegrationsModule {}
