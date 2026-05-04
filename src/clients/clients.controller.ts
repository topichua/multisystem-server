import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ClientsService } from './clients.service';
import { ClientLookupResponseDto } from './dto/client-lookup-response.dto';
import { ClientResponseDto } from './dto/client-response.dto';
import { CreateClientRequestDto } from './dto/create-client-request.dto';
import { UpdateClientRequestDto } from './dto/update-client-request.dto';

@ApiTags('clients')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @ApiOperation({
    summary: 'Look up client by Instagram user id',
    description:
      'Requires `instagramId`. Searches `clients.instagram_user_id` in your workspace. **Always HTTP 200** when a row is missing: `{ associated: false, status: \"ok\" }` — no 404 for “not linked”.',
  })
  @ApiQuery({
    name: 'instagramId',
    required: true,
    description:
      'Instagram scoped user id (same value as `clients.instagram_user_id` / PSID–IGSID string).',
    example: '17841400008460056',
  })
  @ApiOkResponse({ type: ClientLookupResponseDto })
  async lookupByInstagramId(
    @Req() req: { user?: AuthUser },
    @Query('instagramId') instagramId?: string,
  ): Promise<ClientLookupResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    if (instagramId === undefined) {
      throw new BadRequestException('instagramId query parameter is required');
    }
    return this.clients.lookupByInstagramIdForOwner(ownerId, instagramId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create client',
    description:
      'Creates a client in your workspace. `instagramId` is optional; omit or leave empty for a client without a linked `instagram_users` row.',
  })
  @ApiBody({ type: CreateClientRequestDto })
  @ApiCreatedResponse({ type: ClientResponseDto })
  async create(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateClientRequestDto,
  ): Promise<ClientResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.clients.createForOwner(ownerId, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get client by id',
    description: 'Returns the client if it exists in your workspace (`workspace_id` from your integration).',
  })
  @ApiOkResponse({ type: ClientResponseDto })
  async getById(
    @Req() req: { user?: AuthUser },
    @Param('id') id: string,
  ): Promise<ClientResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const clientId = this.parsePositiveInt(id, 'id');
    return this.clients.getByIdForOwner(ownerId, clientId);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update client',
    description:
      'Partial update. Set `instagramId` to null or `""` to clear the Instagram link.',
  })
  @ApiBody({ type: UpdateClientRequestDto })
  @ApiOkResponse({ type: ClientResponseDto })
  async update(
    @Req() req: { user?: AuthUser },
    @Param('id') id: string,
    @Body() dto: UpdateClientRequestDto,
  ): Promise<ClientResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    const clientId = this.parsePositiveInt(id, 'id');
    return this.clients.updateForOwner(ownerId, clientId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete client' })
  @ApiNoContentResponse()
  async remove(
    @Req() req: { user?: AuthUser },
    @Param('id') id: string,
  ): Promise<void> {
    const ownerId = this.requireNumericOwnerId(req);
    const clientId = this.parsePositiveInt(id, 'id');
    await this.clients.deleteForOwner(ownerId, clientId);
  }

  private requireNumericOwnerId(req: { user?: AuthUser }): number {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        'Current authorized user does not contain numeric owner id',
      );
    }
    return ownerId;
  }

  private parsePositiveInt(raw: string, field: string): number {
    const t = raw?.trim() ?? '';
    if (!/^\d+$/.test(t)) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    const n = Number(t);
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    return n;
  }
}
