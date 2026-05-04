import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Not, Repository } from 'typeorm';
import { Client, Company, InstagramUser } from '../database/entities';
import type { ClientLookupResponseDto } from './dto/client-lookup-response.dto';
import type { ClientResponseDto } from './dto/client-response.dto';
import type { CreateClientRequestDto } from './dto/create-client-request.dto';
import type { UpdateClientRequestDto } from './dto/update-client-request.dto';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(InstagramUser)
    private readonly instagramUserRepo: Repository<InstagramUser>,
  ) {}

  async createForOwner(
    ownerId: number,
    dto: CreateClientRequestDto,
  ): Promise<ClientResponseDto> {
    const workspaceId = await this.requireWorkspaceIdForOwner(ownerId);
    const instagramUserId = await this.resolveInstagramUserIdForWorkspace(
      workspaceId,
      dto.instagramId,
      undefined,
    );

    const row = this.clientRepo.create({
      firstName: dto.first_name.trim(),
      lastName: (dto.last_name?.trim() ?? '') || '',
      phone: dto.phone.trim(),
      deliveryInfo: dto.delivery_info.trim(),
      instagramUserId,
      workspaceId,
    });
    await this.clientRepo.save(row);
    return this.toClientDto(row);
  }

  async updateForOwner(
    ownerId: number,
    clientId: number,
    dto: UpdateClientRequestDto,
  ): Promise<ClientResponseDto> {
    const workspaceId = await this.requireWorkspaceIdForOwner(ownerId);
    const row = await this.clientRepo.findOne({
      where: { id: clientId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException('Client not found');
    }

    if (dto.first_name !== undefined) {
      row.firstName = dto.first_name.trim();
    }
    if (dto.last_name !== undefined) {
      row.lastName =
        dto.last_name === null || dto.last_name.trim() === ''
          ? ''
          : dto.last_name.trim();
    }
    if (dto.phone !== undefined) {
      row.phone = dto.phone.trim();
    }
    if (dto.delivery_info !== undefined) {
      row.deliveryInfo = dto.delivery_info.trim();
    }
    if (dto.instagramId !== undefined) {
      row.instagramUserId = await this.resolveInstagramUserIdForWorkspace(
        workspaceId,
        dto.instagramId,
        row.id,
      );
    }

    await this.clientRepo.save(row);
    return this.toClientDto(row);
  }

  async deleteForOwner(ownerId: number, clientId: number): Promise<void> {
    const workspaceId = await this.requireWorkspaceIdForOwner(ownerId);
    const res = await this.clientRepo.delete({ id: clientId, workspaceId });
    if (res.affected === 0) {
      throw new NotFoundException('Client not found');
    }
  }

  /**
   * Looks up `clients.instagram_user_id` within the owner’s workspace.
   * Missing client → HTTP 200 with `{ associated: false, status: 'ok' }` (not 404).
   */
  async lookupByInstagramIdForOwner(
    ownerId: number,
    instagramIdRaw: string,
  ): Promise<ClientLookupResponseDto> {
    const instagramUserId = instagramIdRaw.trim();
    if (!instagramUserId) {
      throw new BadRequestException('instagramId query parameter is required and non-empty');
    }

    const workspaceId = await this.requireWorkspaceIdForOwner(ownerId);

    const row = await this.clientRepo.findOne({
      where: { instagramUserId, workspaceId },
    });

    if (!row) {
      return { associated: false, status: 'ok' };
    }

    return {
      associated: true,
      client: this.toClientDto(row),
    };
  }

  async getByIdForOwner(ownerId: number, clientId: number): Promise<ClientResponseDto> {
    const workspaceId = await this.requireWorkspaceIdForOwner(ownerId);
    const row = await this.clientRepo.findOne({
      where: { id: clientId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException('Client not found');
    }
    return this.toClientDto(row);
  }

  /**
   * `raw` undefined → treat as absent (caller should not pass for create).
   * `raw` null or blank string → NULL column (no Instagram link).
   * Otherwise must exist in `instagram_users` and be unique per workspace.
   */
  private async resolveInstagramUserIdForWorkspace(
    workspaceId: number,
    raw: string | null | undefined,
    excludeClientId: number | undefined,
  ): Promise<string | null> {
    if (raw === undefined || raw === null) {
      return null;
    }
    const id = String(raw).trim();
    if (!id) {
      return null;
    }

    const ig = await this.instagramUserRepo.findOne({ where: { id } });
    if (!ig) {
      throw new BadRequestException(
        `No instagram_users row for instagramId=${id}; sync or create the Instagram user first.`,
      );
    }

    const dupWhere: FindOptionsWhere<Client> = {
      workspaceId,
      instagramUserId: id,
    };
    if (excludeClientId != null) {
      dupWhere.id = Not(excludeClientId);
    }
    const dup = await this.clientRepo.exist({ where: dupWhere });
    if (dup) {
      throw new ConflictException(
        'Another client in this workspace already uses this instagramId',
      );
    }

    return id;
  }

  private async requireWorkspaceIdForOwner(ownerId: number): Promise<number> {
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        'Current authorized user does not contain a numeric owner id',
      );
    }
    const company = await this.companyRepo.findOne({
      where: { ownerId },
      order: { id: 'DESC' },
    });
    if (!company) {
      throw new NotFoundException(
        'Integration not found for current user; create a workspace first',
      );
    }
    return company.workspaceId;
  }

  private toClientDto(row: Client): ClientResponseDto {
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      createdAt: row.createdAt,
      phone: row.phone,
      deliveryInfo: row.deliveryInfo,
      instagramUserId: row.instagramUserId,
      workspaceId: row.workspaceId,
    };
  }
}
