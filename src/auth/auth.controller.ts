import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { MeResponseDto } from './dto/me-response.dto';
import { LoginRequestDto } from './dto/login-request.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthUser } from './types/auth-user.type';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login (env admin or database user)',
    description:
      'Authenticates using ADMIN_EMAIL/ADMIN_PASSWORD from env or users table email/password, and returns a JWT with role super_admin.',
  })
  async login(@Body() dto: LoginRequestDto) {
    return this.authService.loginSuperAdmin(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Current user profile and company',
    description:
      'Returns JWT claims plus full user row (without secrets) and the latest company for this owner when applicable. Env super-admin login has no user/company rows.',
  })
  @ApiOkResponse({ type: MeResponseDto })
  async getAuth(@Req() req: Request & { user: AuthUser }): Promise<MeResponseDto> {
    return this.authService.getMe(req.user);
  }
}
