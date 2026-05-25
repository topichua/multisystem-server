import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { Company, Workspace } from "../database/entities";
import { TelegramIntegrationsModule } from "../telegram-integrations/telegram-integrations.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Company, Workspace]),
    AuthModule,
    TelegramIntegrationsModule,
  ],
  controllers: [IntegrationsController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
