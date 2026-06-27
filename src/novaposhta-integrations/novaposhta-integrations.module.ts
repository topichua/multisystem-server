import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NovaPoshtaIntegration } from "../database/entities";
import { NovaPoshtaApiService } from "./novaposhta-api.service";
import { NovaPoshtaIntegrationsController } from "./novaposhta-integrations.controller";
import { NovaPoshtaSearchController } from "./nova-poshta-search.controller";
import { NovaPoshtaIntegrationsService } from "./novaposhta-integrations.service";

@Module({
  imports: [TypeOrmModule.forFeature([NovaPoshtaIntegration])],
  controllers: [NovaPoshtaIntegrationsController, NovaPoshtaSearchController],
  providers: [NovaPoshtaIntegrationsService, NovaPoshtaApiService],
  exports: [NovaPoshtaIntegrationsService],
})
export class NovaPoshtaIntegrationsModule {}
