import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
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
import { CreateUserRequestDto } from './dto/http/create-user-request.dto';
import { InviteUserRequestDto } from './dto/http/invite-user-request.dto';
import { InviteUserResponseDto } from './dto/http/invite-user-response.dto';
import { ListUsersQueryDto } from './dto/http/list-users-query.dto';
import { PaginatedUsersResponseDto } from './dto/http/paginated-users-response.dto';
import { SafeUserResponseDto } from './dto/http/safe-user-response.dto';
import { UpdateUserRequestDto } from './dto/http/update-user-request.dto';
import type { CreateUserInput } from './dto/create-user.dto';
import type { InviteUserInput } from './dto/invite-user.dto';
import type { UpdateUserInput } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('admin — users')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('users')
export class UsersAdminController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create user' })
  @ApiOkResponse({ type: SafeUserResponseDto })
  async create(
    @Body() dto: CreateUserRequestDto,
  ): Promise<SafeUserResponseDto> {
    const input: CreateUserInput = {
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      password: dto.password,
      status: dto.status,
      metadata: dto.metadata,
    };
    return this.usersService.createUser(input);
  }

  @Post('invite')
  @ApiOperation({ summary: 'Invite user (returns one-time invitation token)' })
  @ApiOkResponse({ type: InviteUserResponseDto })
  async invite(
    @Body() dto: InviteUserRequestDto,
  ): Promise<InviteUserResponseDto> {
    const input: InviteUserInput = {
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      invitedByUserId: dto.invitedByUserId,
      invitationExpiresAt: dto.invitationExpiresAt,
    };
    const result = await this.usersService.inviteUser(input);
    return {
      user: result.user,
      invitationToken: result.rawInvitationToken,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List users (paginated)' })
  @ApiOkResponse({ type: PaginatedUsersResponseDto })
  async list(
    @Query() query: ListUsersQueryDto,
  ): Promise<PaginatedUsersResponseDto> {
    return this.usersService.listUsers({
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by id' })
  @ApiOkResponse({ type: SafeUserResponseDto })
  async getById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SafeUserResponseDto> {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException();
    }
    return user;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  @ApiOkResponse({ type: SafeUserResponseDto })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserRequestDto,
  ): Promise<SafeUserResponseDto> {
    const input: UpdateUserInput = { ...dto };
    return this.usersService.updateUser(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete user' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.usersService.softDeleteUser(id);
  }
}
