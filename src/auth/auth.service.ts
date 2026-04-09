import {
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ROLE_SUPER_ADMIN } from './constants';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import type { LoginRequestDto } from './dto/login-request.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  loginSuperAdmin(dto: LoginRequestDto): { access_token: string } {
    const adminEmail = this.config.get<string>('ADMIN_EMAIL');
    const adminPassword = this.config.get<string>('ADMIN_PASSWORD');
    if (!adminEmail?.trim() || !adminPassword) {
      throw new ServiceUnavailableException(
        'Admin login is not configured (ADMIN_EMAIL / ADMIN_PASSWORD)',
      );
    }
    const email = dto.email.trim().toLowerCase();
    if (
      email !== adminEmail.trim().toLowerCase() ||
      dto.password !== adminPassword
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const payload: JwtPayload = {
      sub: 'super-admin',
      email: adminEmail.trim().toLowerCase(),
      role: ROLE_SUPER_ADMIN,
    };
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
