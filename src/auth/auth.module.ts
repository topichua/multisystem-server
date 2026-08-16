import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  InstagramIntegration,
  PasswordResetToken,
  RegistrationToken,
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
  InstagramOAuthPendingSession,
  TikTokIntegration,
  TikTokOAuthPendingSession,
} from "../database/entities";
import { ProductsModule } from "../products/products.module";
import { SendgridModule } from "../sendgrid/sendgrid.module";
import { ConversationGroupDefaultsModule } from "../conversations/conversation-group-defaults.module";
import { OrderStatusDefaultsModule } from "../orders/order-status-defaults.module";
import { OrderStatusAutomationsModule } from "../order-status-automations/order-status-automations.module";
import { BillingProvisioningModule } from "../billing/billing-provisioning.module";
import { BillingModule } from "../billing/billing.module";
import { InstagramModule } from "../instagram/instagram.module";
import { PasswordService } from "../users/crypto/password.service";
import { InvitationTokenService } from "../users/crypto/invitation-token.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { FacebookOAuthService } from "./facebook-oauth.service";
import { InstagramOAuthService } from "./instagram-oauth.service";
import { TikTokOAuthService } from "./tiktok-oauth.service";
import { CredentialsEncryptionService } from "../payments/encryption/credentials-encryption.service";
import { JwtStrategy } from "./jwt.strategy";
import { RegistrationTokenCryptoService } from "./registration-token-crypto.service";
import { RegistrationService } from "./registration.service";
import { PasswordResetService } from "./password-reset.service";

@Module({
  imports: [
    ProductsModule,
    SendgridModule,
    ConversationGroupDefaultsModule,
    OrderStatusDefaultsModule,
    forwardRef(() => OrderStatusAutomationsModule),
    BillingProvisioningModule,
    BillingModule,
    InstagramModule,
    TypeOrmModule.forFeature([
      User,
      Workspace,
      InstagramIntegration,
      InstagramOAuthPendingSession,
      TikTokIntegration,
      TikTokOAuthPendingSession,
      WorkspaceMember,
      WorkspaceRole,
      RegistrationToken,
      PasswordResetToken,
    ]),
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>("JWT_SECRET");
        if (!secret) {
          throw new Error("JWT_SECRET is not set");
        }
        return { secret };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RegistrationService,
    PasswordResetService,
    RegistrationTokenCryptoService,
    FacebookOAuthService,
    InstagramOAuthService,
    TikTokOAuthService,
    CredentialsEncryptionService,
    JwtStrategy,
    PasswordService,
    InvitationTokenService,
  ],
  exports: [
    AuthService,
    FacebookOAuthService,
    InstagramOAuthService,
    TikTokOAuthService,
    JwtModule,
    PassportModule,
  ],
})
export class AuthModule {}
