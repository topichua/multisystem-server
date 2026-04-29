import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { FacebookOAuthService } from './facebook-oauth.service';
import { MeResponseDto } from './dto/me-response.dto';
import { FacebookOAuthStatusDto } from './dto/facebook-oauth-status.dto';
import { LoginRequestDto } from './dto/login-request.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthUser } from './types/auth-user.type';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly facebookOAuth: FacebookOAuthService,
  ) {}

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

  @Get('facebook')
  @ApiOperation({
    summary: 'Start Facebook Login for Instagram / Page tokens',
    description:
      'Redirects to Facebook OAuth. Open in a browser with ?jwt=… (paste access_token from POST /auth/login) or call with Authorization: Bearer …',
  })
  @ApiQuery({
    name: 'jwt',
    required: false,
    description: 'Access token from POST /auth/login (for browser address bar)',
  })
  async facebookOAuthStart(
    @Query('jwt') jwt: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.facebookOAuth.buildAuthorizeRedirectUrl(
      jwt,
      authorization,
    );
    res.redirect(HttpStatus.FOUND, url);
  }

  @Get('facebook/callback')
  @ApiOperation({
    summary: 'Facebook OAuth redirect URI (Meta calls this with ?code=&state=)',
  })
  @ApiQuery({ name: 'code', required: false })
  @ApiQuery({ name: 'state', required: false })
  @ApiQuery({ name: 'error', required: false })
  @ApiQuery({ name: 'error_description', required: false })
  async facebookOAuthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
  ) {
    return this.facebookOAuth.handleCallback(code, state, error, errorDescription);
  }

  @Get('facebook/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Facebook / Instagram connection status (no tokens returned)',
  })
  @ApiOkResponse({ type: FacebookOAuthStatusDto })
  async facebookOAuthStatus(
    @Req() req: Request & { user: AuthUser },
  ): Promise<FacebookOAuthStatusDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        'Current authorized user does not contain numeric owner id',
      );
    }
    return this.facebookOAuth.getStatusForOwner(ownerId);
  }
}
