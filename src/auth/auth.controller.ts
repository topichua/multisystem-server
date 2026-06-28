import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { FacebookOAuthService } from "./facebook-oauth.service";
import { MeResponseDto } from "./dto/me-response.dto";
import { ChangePasswordRequestDto } from "./dto/change-password-request.dto";
import { ChangePasswordResponseDto } from "./dto/change-password-response.dto";
import { SetEmailRequestDto } from "./dto/set-email-request.dto";
import { UpdateAuthProfileRequestDto, hasAuthProfileUpdateField } from "./dto/update-auth-profile-request.dto";
import { UpdateAuthAvatarResponseDto } from "./dto/update-auth-avatar-response.dto";
import { FacebookOAuthStatusDto } from "./dto/facebook-oauth-status.dto";
import { LoginRequestDto } from "./dto/login-request.dto";
import { StartRegistrationRequestDto } from "./dto/start-registration-request.dto";
import { StartRegistrationResponseDto } from "./dto/start-registration-response.dto";
import { ConfirmRegistrationRequestDto } from "./dto/confirm-registration-request.dto";
import { ConfirmRegistrationResponseDto } from "./dto/confirm-registration-response.dto";
import { RegistrationService } from "./registration.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import type { AuthUser } from "./types/auth-user.type";

type UploadedAvatarFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
};

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly facebookOAuth: FacebookOAuthService,
    private readonly registration: RegistrationService,
  ) {}

  @Post("register/start")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Start workspace owner registration",
    description:
      "Creates a pending registration token and sends a confirmation email. " +
      "Workspace and user are created only after POST /auth/register/confirm.",
  })
  @ApiBody({ type: StartRegistrationRequestDto })
  @ApiOkResponse({ type: StartRegistrationResponseDto })
  async startRegistration(
    @Body() dto: StartRegistrationRequestDto,
  ): Promise<StartRegistrationResponseDto> {
    return this.registration.startRegistration(dto);
  }

  @Post("register/confirm")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Confirm workspace owner registration",
    description:
      "Consumes the raw token from the email link and creates user, workspace (owner), and owner workspace member.",
  })
  @ApiBody({ type: ConfirmRegistrationRequestDto })
  @ApiOkResponse({ type: ConfirmRegistrationResponseDto })
  async confirmRegistration(
    @Body() dto: ConfirmRegistrationRequestDto,
  ): Promise<ConfirmRegistrationResponseDto> {
    return this.registration.confirmRegistration(dto.token);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Login (env admin or database user)",
    description:
      "Authenticates using ADMIN_EMAIL/ADMIN_PASSWORD from env or users table email/password, and returns a JWT with role super_admin.",
  })
  async login(@Body() dto: LoginRequestDto) {
    return this.authService.loginSuperAdmin(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "Current user profile and company",
    description:
      "Returns JWT claims plus full user row (without secrets) and the latest company for this owner when applicable. Env super-admin login has no user/company rows.",
  })
  @ApiOkResponse({ type: MeResponseDto })
  async getAuth(
    @Req() req: Request & { user: AuthUser },
  ): Promise<MeResponseDto> {
    return this.authService.getMe(req.user);
  }

  @Patch("profile")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "Update current user profile",
    description:
      "Updates the authenticated user (JWT `sub` / user id). Accepts camelCase or snake_case field names. Only database users; env super-admin cannot use this.",
  })
  @ApiBody({ type: UpdateAuthProfileRequestDto })
  @ApiOkResponse({ type: MeResponseDto })
  async updateProfile(
    @Req() req: Request & { user: AuthUser },
    @Body() dto: UpdateAuthProfileRequestDto,
  ): Promise<MeResponseDto> {
    if (!hasAuthProfileUpdateField(dto)) {
      throw new BadRequestException("At least one profile field is required");
    }
    return this.authService.updateProfile(req.user, dto);
  }

  @Put("avatar")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Upload current user avatar",
    description:
      "Uploads an image to Cloudflare CDN, stores the URL on the user, and deletes the previous avatar from CDN when present.",
  })
  @ApiBody({
    description: "Multipart body with binary part `image`.",
    required: true,
    ...({
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            required: ["image"],
            properties: {
              image: {
                type: "string",
                format: "binary",
                description: "Avatar image file (JPEG, PNG, WebP, …)",
              },
            },
          },
        },
      },
    } as Record<string, unknown>),
  })
  @ApiOkResponse({ type: UpdateAuthAvatarResponseDto })
  async updateAvatar(
    @Req() req: Request & { user: AuthUser },
    @UploadedFile() image?: UploadedAvatarFile,
  ): Promise<UpdateAuthAvatarResponseDto> {
    return this.authService.updateAvatar(req.user, image);
  }

  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "Change current user password",
    description:
      "Requires the existing password and a new password. Uses the authenticated user id from JWT.",
  })
  @ApiBody({ type: ChangePasswordRequestDto })
  @ApiOkResponse({ type: ChangePasswordResponseDto })
  async changePassword(
    @Req() req: Request & { user: AuthUser },
    @Body() dto: ChangePasswordRequestDto,
  ): Promise<ChangePasswordResponseDto> {
    return this.authService.changePassword(req.user, dto);
  }

  @Post("set-email")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "Set current user email",
    description:
      "Updates email immediately (no confirmation email). Requires current password.",
  })
  @ApiBody({ type: SetEmailRequestDto })
  @ApiOkResponse({ type: MeResponseDto })
  async setEmail(
    @Req() req: Request & { user: AuthUser },
    @Body() dto: SetEmailRequestDto,
  ): Promise<MeResponseDto> {
    return this.authService.setEmail(req.user, dto);
  }

  @Get("facebook")
  @ApiOperation({
    summary: "Start Facebook Login for Instagram / Page tokens",
    description:
      "Redirects to Facebook OAuth. Open in a browser with ?jwt=… (paste access_token from POST /auth/login) or call with Authorization: Bearer …",
  })
  @ApiQuery({
    name: "jwt",
    required: false,
    description: "Access token from POST /auth/login (for browser address bar)",
  })
  async facebookOAuthStart(
    @Query("jwt") jwt: string | undefined,
    @Headers("authorization") authorization: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.facebookOAuth.buildAuthorizeRedirectUrl(
      jwt,
      authorization,
    );
    res.redirect(HttpStatus.FOUND, url);
  }

  @Get("facebook/callback")
  @ApiOperation({
    summary: "Facebook OAuth redirect URI (Meta calls this with ?code=&state=)",
  })
  @ApiQuery({ name: "code", required: false })
  @ApiQuery({ name: "state", required: false })
  @ApiQuery({ name: "error", required: false })
  @ApiQuery({ name: "error_description", required: false })
  async facebookOAuthCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Query("error_description") errorDescription: string | undefined,
  ) {
    return this.facebookOAuth.handleCallback(
      code,
      state,
      error,
      errorDescription,
    );
  }

  @Get("facebook/status")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({
    summary: "Facebook / Instagram connection status (no tokens returned)",
  })
  @ApiOkResponse({ type: FacebookOAuthStatusDto })
  async facebookOAuthStatus(
    @Req() req: Request & { user: AuthUser },
  ): Promise<FacebookOAuthStatusDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return this.facebookOAuth.getStatusForOwner(ownerId);
  }
}
