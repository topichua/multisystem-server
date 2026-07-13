import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { PasswordResetToken, User, UserStatus } from "../database/entities";
import { DEFAULT_SUPPORT_EMAIL } from "../sendgrid/sendgrid.constants";
import { SendgridService } from "../sendgrid/sendgrid.service";
import { PasswordService } from "../users/crypto/password.service";
import type { ForgotPasswordResponseDto } from "./dto/forgot-password-response.dto";
import type { ResetPasswordResponseDto } from "./dto/reset-password-response.dto";
import { RegistrationTokenCryptoService } from "./registration-token-crypto.service";

const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_EXPIRES_LABEL = "30 хвилин";

@Injectable()
export class PasswordResetService {
  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepo: Repository<PasswordResetToken>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly passwordService: PasswordService,
    private readonly tokenCrypto: RegistrationTokenCryptoService,
    private readonly sendgrid: SendgridService,
    private readonly config: ConfigService,
  ) {}

  async requestPasswordReset(
    emailRaw: string,
  ): Promise<ForgotPasswordResponseDto> {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.userRepo.findOne({
      where: { email },
    });

    if (!user || user.status !== UserStatus.Active) {
      return { success: true };
    }

    await this.passwordResetTokenRepo.delete({
      userId: user.id,
      usedAt: IsNull(),
    });

    const rawToken = this.tokenCrypto.generateRawToken();
    const tokenHash = this.tokenCrypto.hash(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

    await this.passwordResetTokenRepo.save(
      this.passwordResetTokenRepo.create({
        tokenHash,
        userId: user.id,
        expiresAt,
        usedAt: null,
      }),
    );

    const resetUrl = this.buildResetUrl(rawToken);
    await this.sendgrid.sendPasswordResetEmail({
      to: user.email,
      firstName: user.firstName,
      resetUrl,
      expiresIn: this.getExpiresInLabel(),
      logoUrl: this.resolveLogoUrl(),
      supportEmail: this.resolveSupportEmail(),
    });

    if (this.config.get<string>("NODE_ENV") !== "production") {
      return { success: true, resetUrl };
    }
    return { success: true };
  }

  async resetPassword(
    token: string,
    password: string,
  ): Promise<ResetPasswordResponseDto> {
    const rawToken = token.trim();
    if (!rawToken) {
      throw new BadRequestException("Reset token is required");
    }

    const tokenHash = this.tokenCrypto.hash(rawToken);
    const pending = await this.passwordResetTokenRepo.findOne({
      where: { tokenHash },
      relations: { user: true },
    });
    if (!pending) {
      throw new BadRequestException(
        "Invalid or expired reset token. Use the raw token from the email link (?token=…).",
      );
    }
    if (pending.usedAt != null) {
      throw new BadRequestException("Reset token has already been used");
    }
    if (pending.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Reset token has expired");
    }
    if (!pending.user || pending.user.status !== UserStatus.Active) {
      throw new BadRequestException("User account is not active");
    }

    const now = new Date();
    await this.userRepo.manager.transaction(async (em) => {
      const tokenRepo = em.getRepository(PasswordResetToken);
      const userRepo = em.getRepository(User);

      const locked = await tokenRepo.findOne({
        where: { id: pending.id, usedAt: IsNull() },
        lock: { mode: "pessimistic_write" },
      });
      if (!locked) {
        throw new BadRequestException("Reset token has already been used");
      }
      if (locked.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException("Reset token has expired");
      }

      const user = await userRepo.findOne({
        where: { id: locked.userId },
        lock: { mode: "pessimistic_write" },
      });
      if (!user || user.status !== UserStatus.Active) {
        throw new BadRequestException("User account is not active");
      }

      user.passwordHash = await this.passwordService.hash(password);
      await userRepo.save(user);

      locked.usedAt = now;
      await tokenRepo.save(locked);

      await tokenRepo.delete({
        userId: user.id,
        usedAt: IsNull(),
      });
    });

    return { success: true };
  }

  private buildResetUrl(rawToken: string): string {
    const base = this.config.get<string>("APP_URL")?.trim().replace(/\/$/, "");
    if (!base) {
      throw new InternalServerErrorException("APP_URL is not configured");
    }
    return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
  }

  private resolveLogoUrl(): string {
    const configured = this.config.get<string>("EMAIL_LOGO_URL")?.trim();
    if (configured) {
      return configured;
    }
    const base = this.config.get<string>("APP_URL")?.trim().replace(/\/$/, "");
    if (!base) {
      throw new InternalServerErrorException("APP_URL is not configured");
    }
    return `${base}/email/logo-mark.png`;
  }

  private resolveSupportEmail(): string {
    return (
      this.config.get<string>("SUPPORT_EMAIL")?.trim() || DEFAULT_SUPPORT_EMAIL
    );
  }

  private getExpiresInLabel(): string {
    return (
      this.config.get<string>("PASSWORD_RESET_EXPIRES_LABEL")?.trim() ||
      PASSWORD_RESET_EXPIRES_LABEL
    );
  }
}
