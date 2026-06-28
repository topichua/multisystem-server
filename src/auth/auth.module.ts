import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  InstagramIntegration,
  RegistrationToken,
  User,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from "../database/entities";
import { ProductsModule } from "../products/products.module";
import { SendgridModule } from "../sendgrid/sendgrid.module";
import { PasswordService } from "../users/crypto/password.service";
import { InvitationTokenService } from "../users/crypto/invitation-token.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { FacebookOAuthService } from "./facebook-oauth.service";
import { JwtStrategy } from "./jwt.strategy";
import { RegistrationTokenCryptoService } from "./registration-token-crypto.service";
import { RegistrationService } from "./registration.service";

@Module({
  imports: [
    ProductsModule,
    SendgridModule,
    TypeOrmModule.forFeature([
      User,
      Workspace,
      InstagramIntegration,
      WorkspaceMember,
      WorkspaceRole,
      RegistrationToken,
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
    RegistrationTokenCryptoService,
    FacebookOAuthService,
    JwtStrategy,
    PasswordService,
    InvitationTokenService,
  ],
  exports: [AuthService, FacebookOAuthService, JwtModule, PassportModule],
})
export class AuthModule {}
