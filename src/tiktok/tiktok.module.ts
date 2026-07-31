import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TikTokIntegration } from "../database/entities/tiktok-integration.entity";
import { CredentialsEncryptionService } from "../payments/encryption/credentials-encryption.service";
import { WorkspaceAccessModule } from "../workspace-access/workspace-access.module";
import { TikTokController } from "./tiktok.controller";
import { TikTokService } from "./tiktok.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([TikTokIntegration]),
    WorkspaceAccessModule,
  ],
  controllers: [TikTokController],
  providers: [TikTokService, CredentialsEncryptionService],
  exports: [TikTokService],
})
export class TikTokModule {}
