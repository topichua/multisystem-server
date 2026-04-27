import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../database/entities';
import { ROLE_SUPER_ADMIN } from './constants';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import type { LoginRequestDto } from './dto/login-request.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

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
