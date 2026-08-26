import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  forwardRef,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import {
  RegistrationToken,
  User,
  UserStatus,
  Workspace,
  WorkspaceMember,
  WorkspaceMemberStatus,
  WorkspaceRole,
} from "../database/entities";
import { SendgridService } from "../sendgrid/sendgrid.service";
import { ConversationGroupDefaultsService } from "../conversations/conversation-group-defaults.service";
import { OrderStatusDefaultsService } from "../orders/order-status-defaults.service";
import { OrderStatusAutomationDefaultsService } from "../order-status-automations/order-status-automation-defaults.service";
import { BillingProvisioningService } from "../billing/billing-provisioning.service";
import { PERMISSION_KEYS } from "../workspace-access/permissions/permission-keys";
import { PasswordService } from "../users/crypto/password.service";
import type { ConfirmRegistrationResponseDto } from "./dto/confirm-registration-response.dto";
import type { StartRegistrationRequestDto } from "./dto/start-registration-request.dto";
import type { StartRegistrationResponseDto } from "./dto/start-registration-response.dto";
import { RegistrationTokenCryptoService } from "./registration-token-crypto.service";
import { InvitationTokenService } from "../users/crypto/invitation-token.service";

const REGISTRATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class RegistrationService {
  private readonly log = new Logger(RegistrationService.name);

  constructor(
    @InjectRepository(RegistrationToken)
    private readonly registrationTokenRepo: Repository<RegistrationToken>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly passwordService: PasswordService,
    private readonly registrationTokenCrypto: RegistrationTokenCryptoService,
    private readonly invitationTokenService: InvitationTokenService,
    private readonly sendgrid: SendgridService,
    private readonly config: ConfigService,
    private readonly conversationGroupDefaults: ConversationGroupDefaultsService,
    private readonly orderStatusDefaults: OrderStatusDefaultsService,
    @Inject(forwardRef(() => OrderStatusAutomationDefaultsService))
    private readonly automationDefaults: OrderStatusAutomationDefaultsService,
    private readonly billingProvisioning: BillingProvisioningService,
  ) {}

  async startRegistration(
    dto: StartRegistrationRequestDto,
  ): Promise<StartRegistrationResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const phone = this.normalizePhone(dto.phone);
    await this.assertEmailAvailable(email);

    await this.registrationTokenRepo.delete({
      email,
      usedAt: IsNull(),
    });

    const rawToken = this.registrationTokenCrypto.generateRawToken();
    const tokenHash = this.registrationTokenCrypto.hash(rawToken);
    const passwordHash = await this.passwordService.hash(dto.password);
    const expiresAt = new Date(Date.now() + REGISTRATION_TOKEN_TTL_MS);

    await this.registrationTokenRepo.save(
      this.registrationTokenRepo.create({
        tokenHash,
        email,
        companyName: dto.companyName.trim(),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone,
        passwordHash,
        expiresAt,
        usedAt: null,
      }),
    );

    const confirmUrl = this.buildConfirmUrl(rawToken);

    try {
      await this.sendgrid.sendRegistrationConfirmationEmail({
        to: email,
        firstName: dto.firstName.trim(),
        companyName: dto.companyName.trim(),
        confirmUrl,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(
        `Registration confirmation email failed to=${email}: ${err}`,
      );
    }

    return { success: true, confirmUrl };
  }

  async confirmRegistration(
    token: string,
  ): Promise<ConfirmRegistrationResponseDto> {
    const rawToken = token.trim();
    if (!rawToken) {
      throw new BadRequestException("Registration token is required");
    }

    const tokenHash = this.registrationTokenCrypto.hash(rawToken);
    const pending = await this.registrationTokenRepo.findOne({
      where: { tokenHash },
    });
    if (!pending) {
      throw new BadRequestException(
        "Invalid or expired registration token. Use the raw token from the email link (?token=…), not token_hash from the database.",
      );
    }
    if (pending.usedAt != null) {
      throw new BadRequestException("Registration token has already been used");
    }
    if (pending.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Registration token has expired");
    }

    await this.assertEmailAvailable(pending.email);

    const now = new Date();
    const result = await this.userRepo.manager.transaction(async (em) => {
      const tokenRepo = em.getRepository(RegistrationToken);
      const locked = await tokenRepo.findOne({
        where: { id: pending.id, usedAt: IsNull() },
        lock: { mode: "pessimistic_write" },
      });
      if (!locked) {
        throw new BadRequestException(
          "Registration token has already been used",
        );
      }
      if (locked.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException("Registration token has expired");
      }

      const userRepo = em.getRepository(User);
      const emailTaken = await userRepo.exist({
        where: { email: locked.email },
      });
      if (emailTaken) {
        throw new ConflictException("Email already in use");
      }

      const user = await userRepo.save(
        userRepo.create({
          email: locked.email,
          firstName: locked.firstName,
          lastName: locked.lastName,
          phone: locked.phone,
          mobilePhoneHash: this.mobilePhoneHashFromPhone(locked.phone),
          passwordHash: locked.passwordHash,
          status: UserStatus.Active,
          emailVerifiedAt: now,
          metadata: {},
        }),
      );

      const workspace = await em.getRepository(Workspace).save(
        em.getRepository(Workspace).create({
          name: locked.companyName,
          ownerId: user.id,
        }),
      );

      const ownerRole = await em.getRepository(WorkspaceRole).save(
        em.getRepository(WorkspaceRole).create({
          workspaceId: workspace.id,
          slug: "owner",
          name: "Owner",
          description: null,
          color: null,
          permissions: [...PERMISSION_KEYS],
          permissionOptions: {},
          permissionOptionLists: {},
        }),
      );

      const member = await em.getRepository(WorkspaceMember).save(
        em.getRepository(WorkspaceMember).create({
          workspaceId: workspace.id,
          userId: user.id,
          roleId: ownerRole.id,
          status: WorkspaceMemberStatus.ACTIVE,
          invitedByUserId: null,
          joinedAt: now,
          color: null,
          integrationScopes: null,
        }),
      );

      locked.usedAt = now;
      await tokenRepo.save(locked);

      return { user, workspace, member, ownerRole };
    });

    await this.conversationGroupDefaults.ensureSystemGroups(
      result.workspace.id,
    );
    await this.orderStatusDefaults.ensureSystemStatuses(result.workspace.id);
    await this.automationDefaults.createRecommendedDeliveryAutomations(
      result.workspace.id,
    );
    await this.automationDefaults.createRecommendedPaymentAutomations(
      result.workspace.id,
    );
    await this.billingProvisioning.ensureForWorkspace(result.workspace.id);

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        phone: result.user.phone,
        emailVerifiedAt: result.user.emailVerifiedAt,
      },
      workspace: {
        id: result.workspace.id,
        name: result.workspace.name,
        ownerId: result.workspace.ownerId,
      },
      member: {
        id: result.member.id,
        workspaceId: result.member.workspaceId,
        userId: result.member.userId,
        roleSlug: result.ownerRole.slug,
        status: result.member.status,
      },
    };
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const taken = await this.userRepo.exist({ where: { email } });
    if (taken) {
      throw new ConflictException("Email already in use");
    }
  }

  private normalizePhone(raw: string | null | undefined): string | null {
    if (raw == null) {
      return null;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private mobilePhoneHashFromPhone(
    phone: string | null | undefined,
  ): string | null {
    const normalized = this.normalizePhone(phone);
    if (!normalized) {
      return null;
    }
    const digits = normalized.replace(/\D/g, "");
    return digits.length === 0
      ? null
      : this.invitationTokenService.hash(digits);
  }

  private buildConfirmUrl(rawToken: string): string {
    const base = this.config.get<string>("APP_URL")?.trim().replace(/\/$/, "");
    if (!base) {
      throw new InternalServerErrorException("APP_URL is not configured");
    }
    return `${base}/register/confirm?token=${encodeURIComponent(rawToken)}`;
  }
}
