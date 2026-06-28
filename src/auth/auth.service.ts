import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { Repository } from "typeorm";
import { InstagramIntegration, User, UserStatus, WorkspaceMember, WorkspaceMemberStatus } from "../database/entities";
import { CloudflareImagesService } from "../products/cloudflare-images.service";
import { PasswordService } from "../users/crypto/password.service";
import { InvitationTokenService } from "../users/crypto/invitation-token.service";
import { ROLE_SUPER_ADMIN } from "./constants";
import type { AuthUser } from "./types/auth-user.type";
import type { JwtPayload } from "./interfaces/jwt-payload.interface";
import type { LoginRequestDto } from "./dto/login-request.dto";
import type {
  CompanyMeDto,
  MeResponseDto,
  UserMeDto,
} from "./dto/me-response.dto";
import type { UpdateAuthProfileRequestDto } from "./dto/update-auth-profile-request.dto";
import {
  resolveAuthProfileFirstName,
  resolveAuthProfileLastName,
  resolveAuthProfilePostalCode,
  resolveAuthProfileStreetLine1,
  resolveAuthProfileStreetLine2,
} from "./dto/update-auth-profile-request.dto";
import type { ChangePasswordRequestDto } from "./dto/change-password-request.dto";
import type { SetEmailRequestDto } from "./dto/set-email-request.dto";

/** Default access token lifetime when `JWT_EXPIRES_SECONDS` is unset (30 days). */
const DEFAULT_JWT_EXPIRES_SECONDS = 30 * 24 * 60 * 60;

type UploadedAvatarFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
    private readonly invitationTokenService: InvitationTokenService,
    private readonly cloudflareImages: CloudflareImagesService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(InstagramIntegration)
    private readonly companyRepo: Repository<InstagramIntegration>,
    @InjectRepository(WorkspaceMember)
    private readonly workspaceMemberRepo: Repository<WorkspaceMember>,
  ) {}

  async getMe(authUser: AuthUser): Promise<MeResponseDto> {
    if (authUser.userId === "super-admin") {
      return {
        email: authUser.email,
        role: authUser.role,
        user: null,
        company: null,
        companyName: null,
      };
    }

    const user = await this.requireUserFromAuth(authUser);
    return this.buildMeResponse(authUser, user);
  }

  async updateProfile(
    authUser: AuthUser,
    dto: UpdateAuthProfileRequestDto,
  ): Promise<MeResponseDto> {
    if (authUser.userId === "super-admin") {
      throw new BadRequestException(
        "Env super-admin account has no profile to update",
      );
    }

    const user = await this.requireUserFromAuth(authUser);
    const firstName = resolveAuthProfileFirstName(dto);
    if (firstName !== undefined) {
      user.firstName = firstName;
    }
    const lastName = resolveAuthProfileLastName(dto);
    if (lastName !== undefined) {
      user.lastName = lastName;
    }
    if (dto.phone !== undefined) {
      user.phone = this.normalizeUserPhone(dto.phone);
      if (user.phone == null) {
        user.mobilePhoneHash = null;
      } else {
        const digits = user.phone.replace(/\D/g, "");
        user.mobilePhoneHash =
          digits.length === 0
            ? null
            : this.invitationTokenService.hash(digits);
      }
    }
    if (dto.country !== undefined) {
      user.country = dto.country?.trim() ? dto.country.trim() : null;
    }
    if (dto.region !== undefined) {
      user.region = dto.region?.trim() ? dto.region.trim() : null;
    }
    if (dto.city !== undefined) {
      user.city = dto.city?.trim() ? dto.city.trim() : null;
    }
    const streetLine1 = resolveAuthProfileStreetLine1(dto);
    if (streetLine1 !== undefined) {
      user.streetLine1 = streetLine1;
    }
    const streetLine2 = resolveAuthProfileStreetLine2(dto);
    if (streetLine2 !== undefined) {
      user.streetLine2 = streetLine2;
    }
    const postalCode = resolveAuthProfilePostalCode(dto);
    if (postalCode !== undefined) {
      user.postalCode = postalCode;
    }

    const saved = await this.userRepo.save(user);
    return this.buildMeResponse(authUser, saved);
  }

  async updateAvatar(
    authUser: AuthUser,
    file: UploadedAvatarFile | undefined,
  ): Promise<{ avatar_src: string }> {
    if (authUser.userId === "super-admin") {
      throw new BadRequestException(
        "Env super-admin account has no profile to update",
      );
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException("Image file is required");
    }

    const user = await this.requireUserFromAuth(authUser);
    const uploaded = await this.cloudflareImages.uploadImage(file);

    if (user.avatarCloudflareImageId) {
      await this.cloudflareImages.deleteImage(user.avatarCloudflareImageId);
    }

    user.avatarSrc = uploaded.cdnUrl;
    user.avatarCloudflareImageId = uploaded.cloudflareImageId;
    await this.userRepo.save(user);

    return { avatar_src: uploaded.cdnUrl };
  }

  async changePassword(
    authUser: AuthUser,
    dto: ChangePasswordRequestDto,
  ): Promise<{ changed: true }> {
    if (authUser.userId === "super-admin") {
      throw new BadRequestException(
        "Env super-admin account password is managed via environment variables",
      );
    }

    const user = await this.requireUserFromAuth(authUser);
    if (!user.passwordHash) {
      throw new BadRequestException("User has no password set");
    }

    const currentMatch = await this.passwordService.compare(
      dto.existing_password,
      user.passwordHash,
    );
    if (!currentMatch) {
      throw new BadRequestException("Invalid existing password");
    }

    if (dto.existing_password === dto.new_password) {
      throw new BadRequestException(
        "New password must differ from existing password",
      );
    }

    user.passwordHash = await this.passwordService.hash(dto.new_password);
    await this.userRepo.save(user);
    return { changed: true };
  }

  async setEmail(
    authUser: AuthUser,
    dto: SetEmailRequestDto,
  ): Promise<MeResponseDto> {
    if (authUser.userId === "super-admin") {
      throw new BadRequestException(
        "Env super-admin account email is managed via environment variables",
      );
    }

    const user = await this.requireUserFromAuth(authUser);
    if (!user.passwordHash) {
      throw new BadRequestException("User has no password set");
    }

    const currentMatch = await this.passwordService.compare(
      dto.existing_password,
      user.passwordHash,
    );
    if (!currentMatch) {
      throw new BadRequestException("Invalid existing password");
    }

    const nextEmail = dto.new_email.trim().toLowerCase();
    if (nextEmail === user.email) {
      return this.buildMeResponse(authUser, user);
    }

    const other = await this.userRepo.findOne({
      where: { email: nextEmail },
      withDeleted: false,
    });
    if (other && other.id !== user.id) {
      throw new ConflictException("Email already in use");
    }

    user.email = nextEmail;
    const saved = await this.userRepo.save(user);
    return this.buildMeResponse(authUser, saved);
  }

  private normalizeUserPhone(raw: string | null | undefined): string | null {
    if (raw == null) {
      return null;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private async requireUserFromAuth(authUser: AuthUser): Promise<User> {
    const id = Number(authUser.userId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new UnauthorizedException();
    }

    const user = await this.userRepo.findOne({
      where: { id },
      withDeleted: false,
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  private async buildMeResponse(
    authUser: AuthUser,
    user: User,
  ): Promise<MeResponseDto> {
    const company = await this.companyRepo.findOne({
      where: { ownerId: user.id },
      order: { id: "DESC" },
    });

    const companyDto: CompanyMeDto | null = company
      ? {
          id: company.id,
          name: company.name,
          pageId: company.pageId,
          instagramAccountId: company.instagramAccountId?.trim() ?? null,
          workspaceId: company.workspaceId,
        }
      : null;

    return {
      email: user.email,
      role: authUser.role,
      user: this.toUserMeDto(user),
      company: companyDto,
      companyName: companyDto?.name ?? null,
    };
  }

  private toUserMeDto(user: User): UserMeDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatar_src: user.avatarSrc,
      phone: user.phone,
      status: user.status,
      invitedAt: user.invitedAt,
      invitedByUserId: user.invitedByUserId,
      invitationExpiresAt: user.invitationExpiresAt,
      invitationAcceptedAt: user.invitationAcceptedAt,
      emailVerifiedAt: user.emailVerifiedAt,
      lastSeenAt: user.lastSeenAt,
      lastLoginAt: user.lastLoginAt,
      country: user.country,
      region: user.region,
      city: user.city,
      streetLine1: user.streetLine1,
      streetLine2: user.streetLine2,
      postalCode: user.postalCode,
      metadata: user.metadata ?? {},
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async loginSuperAdmin(
    dto: LoginRequestDto,
  ): Promise<{ access_token: string }> {
    const email = dto.email.trim().toLowerCase();

    const adminEmail = this.config
      .get<string>("ADMIN_EMAIL")
      ?.trim()
      .toLowerCase();
    const adminPassword = this.config.get<string>("ADMIN_PASSWORD");
    if (
      adminEmail &&
      adminPassword &&
      email === adminEmail &&
      dto.password === adminPassword
    ) {
      return this.signAccessToken({
        sub: "super-admin",
        email: adminEmail,
        role: ROLE_SUPER_ADMIN,
      });
    }

    const user = await this.userRepo.findOne({
      where: { email },
      withDeleted: false,
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }
    if (user.status !== UserStatus.Active) {
      throw new UnauthorizedException("User is not active");
    }
    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.issueAccessTokenForUser(user);
  }

  async issueAccessTokenForUser(
    user: User,
    workspaceIdOverride?: number,
  ): Promise<{ access_token: string }> {
    const workspaceId =
      workspaceIdOverride ?? (await this.resolveSessionWorkspaceId(user.id));
    return this.signAccessToken({
      sub: String(user.id),
      email: user.email,
      role: ROLE_SUPER_ADMIN,
      ...(workspaceId != null ? { workspaceId } : {}),
    });
  }

  private async resolveSessionWorkspaceId(
    userId: number,
  ): Promise<number | undefined> {
    const company = await this.companyRepo.findOne({
      where: { ownerId: userId },
      order: { id: "DESC" },
    });
    if (company) {
      return company.workspaceId;
    }

    const member = await this.workspaceMemberRepo.findOne({
      where: { userId, status: WorkspaceMemberStatus.ACTIVE },
      order: { id: "DESC" },
    });
    return member?.workspaceId;
  }

  private signAccessToken(payload: JwtPayload): { access_token: string } {
    const expiresSeconds = parseInt(
      this.config.get<string>("JWT_EXPIRES_SECONDS") ??
        `${DEFAULT_JWT_EXPIRES_SECONDS}`,
      10,
    );
    return {
      access_token: this.jwtService.sign(payload, {
        expiresIn: expiresSeconds,
      }),
    };
  }
}
