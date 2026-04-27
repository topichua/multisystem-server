import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginRequestDto } from './dto/login-request.dto';

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
}
