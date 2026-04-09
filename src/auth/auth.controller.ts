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
    summary: 'Super admin login (env credentials)',
    description:
      'Returns a JWT with role super_admin. Configure ADMIN_EMAIL and ADMIN_PASSWORD.',
  })
  login(@Body() dto: LoginRequestDto) {
    return this.authService.loginSuperAdmin(dto);
  }
}
