import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Company, User, UserStatus } from '../database/entities';
import { ROLE_SUPER_ADMIN } from './constants';
import type { AuthUser } from './types/auth-user.type';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import type { LoginRequestDto } from './dto/login-request.dto';
import type {
  CompanyMeDto,
  MeResponseDto,
  UserMeDto,
} from './dto/me-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {}

  async getMe(authUser: AuthUser): Promise<MeResponseDto> {
    if (authUser.userId === 'super-admin') {
      return {
        email: authUser.email,
        role: authUser.role,
        user: null,
        company: null,
        companyName: null,
      };
    }

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

    const company = await this.companyRepo.findOne({
      where: { ownerId: id },
      order: { id: 'DESC' },
    });

    const companyDto: CompanyMeDto | null = company
      ? { id: company.id, name: company.name, pageId: company.pageId }
      : null;

    return {
      email: authUser.email,
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

    const adminEmail = this.config.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();
    const adminPassword = this.config.get<string>('ADMIN_PASSWORD');
    if (
      adminEmail &&
      adminPassword &&
      email === adminEmail &&
      dto.password === adminPassword
    ) {
      return this.signAccessToken({
        sub: 'super-admin',
        email: adminEmail,
        role: ROLE_SUPER_ADMIN,
      });
    }

    const user = await this.userRepo.findOne({
      where: { email },
      withDeleted: false,
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status !== UserStatus.Active) {
      throw new UnauthorizedException('User is not active');
    }
    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.signAccessToken({
      sub: String(user.id),
      email: user.email,
      role: ROLE_SUPER_ADMIN,
    });
  }

  private signAccessToken(payload: JwtPayload): { access_token: string } {
    const expiresSeconds = parseInt(
      this.config.get<string>('JWT_EXPIRES_SECONDS') ?? `${8 * 60 * 60}`,
      10,
    );
    return {
      access_token: this.jwtService.sign(payload, {
        expiresIn: expiresSeconds,
      }),
    };
  }
}
