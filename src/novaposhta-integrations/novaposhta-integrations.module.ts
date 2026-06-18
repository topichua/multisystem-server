import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NovaPoshtaIntegration } from "../database/entities";
import { NovaPoshtaApiService } from "./novaposhta-api.service";
import { NovaPoshtaIntegrationsController } from "./novaposhta-integrations.controller";
import { NovaPoshtaIntegrationsService } from "./novaposhta-integrations.service";

@Module({
  imports: [TypeOrmModule.forFeature([NovaPoshtaIntegration])],
  controllers: [NovaPoshtaIntegrationsController],
  providers: [NovaPoshtaIntegrationsService, NovaPoshtaApiService],
  exports: [NovaPoshtaIntegrationsService],
})
export class NovaPoshtaIntegrationsModule {}
