import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import {
  InstagramIntegration,
  TikTokIntegration,
  TikTokOAuthState,
} from "../database/entities";
import { TelegramIntegrationsModule } from "../telegram-integrations/telegram-integrations.module";
import { NovaPoshtaIntegrationsModule } from "../novaposhta-integrations/novaposhta-integrations.module";
import { InstagramModule } from "../instagram/instagram.module";
import { CredentialsEncryptionService } from "../payments/encryption/credentials-encryption.service";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { TikTokIntegrationsController } from "./tiktok-integrations.controller";
import { TikTokOAuthConnectService } from "./tiktok-oauth-connect.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstagramIntegration,
      TikTokIntegration,
      TikTokOAuthState,
    ]),
    AuthModule,
    TelegramIntegrationsModule,
    NovaPoshtaIntegrationsModule,
    InstagramModule,
  ],
  controllers: [IntegrationsController, TikTokIntegrationsController],
  providers: [
    IntegrationsService,
    TikTokOAuthConnectService,
    CredentialsEncryptionService,
  ],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
