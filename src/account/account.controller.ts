import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { AccountService } from './account.service';
import { AccountResponseDto } from './dto/account-response.dto';

@ApiTags('admin — account')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get Instagram account details for CRM panel' })
  @ApiOkResponse({ type: AccountResponseDto })
  async getById(
    @Req() req: { user?: AuthUser },
    @Param('id') id: string,
  ): Promise<AccountResponseDto> {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        'Current authorized user does not contain numeric owner id',
      );
    }

    return this.accountService.getInstagramAccount(id);
  }
}
