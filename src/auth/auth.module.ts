import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InstagramIntegration, User, Workspace } from "../database/entities";
import { PasswordService } from "../users/crypto/password.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { FacebookOAuthService } from "./facebook-oauth.service";
import { JwtStrategy } from "./jwt.strategy";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Workspace, InstagramIntegration]),
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
  providers: [AuthService, FacebookOAuthService, JwtStrategy, PasswordService],
  exports: [AuthService, FacebookOAuthService, JwtModule, PassportModule],
})
export class AuthModule {}
