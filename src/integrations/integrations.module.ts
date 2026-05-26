import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { InstagramIntegration } from "../database/entities";
import { TelegramIntegrationsModule } from "../telegram-integrations/telegram-integrations.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([InstagramIntegration]),
    AuthModule,
    TelegramIntegrationsModule,
  ],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
