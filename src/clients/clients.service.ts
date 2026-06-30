import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsWhere, Not, Repository } from "typeorm";
import { Client, InstagramUser, TelegramUser } from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type { ClientsListResponseDto } from "./dto/clients-list-response.dto";
import type { ClientLookupResponseDto } from "./dto/client-lookup-response.dto";
import type { ClientResponseDto } from "./dto/client-response.dto";
import type { CreateClientRequestDto } from "./dto/create-client-request.dto";
import type { UpdateClientRequestDto } from "./dto/update-client-request.dto";

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(InstagramUser)
    private readonly instagramUserRepo: Repository<InstagramUser>,
    @InjectRepository(TelegramUser)
    private readonly telegramUserRepo: Repository<TelegramUser>,
    private readonly workspaceContext: WorkspaceAccessContextService,
  ) {}

  async createForOwner(
    ownerId: number,
    dto: CreateClientRequestDto,
  ): Promise<ClientResponseDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const { instagramUserId, telegramUserId } =
      this.parseSocialLinkInput(dto);

    const row = this.clientRepo.create({
      firstName: (dto.first_name?.trim() ?? "") || "",
      lastName: (dto.last_name?.trim() ?? "") || "",
      phone: (dto.phone?.trim() ?? "") || "",
      instagramUserId: await this.resolveInstagramUserIdForWorkspace(
        workspaceId,
        instagramUserId,
        undefined,
      ),
      telegramUserId: await this.resolveTelegramUserIdForWorkspace(
        workspaceId,
        telegramUserId,
        undefined,
      ),
      workspaceId,
    });
    this.assertSingleSocialLink(row.instagramUserId, row.telegramUserId);
    await this.clientRepo.save(row);
    return this.toClientDto(row);
  }

  async updateForOwner(
    ownerId: number,
    clientId: number,
    dto: UpdateClientRequestDto,
  ): Promise<ClientResponseDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const row = await this.clientRepo.findOne({
      where: { id: clientId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Client not found");
    }

    if (dto.first_name !== undefined) {
      row.firstName = dto.first_name.trim();
    }
    if (dto.last_name !== undefined) {
      row.lastName =
        dto.last_name === null || dto.last_name.trim() === ""
          ? ""
          : dto.last_name.trim();
    }
    if (dto.phone !== undefined) {
      row.phone = dto.phone.trim();
    }
    const instagramRaw =
      dto.instagramUserId !== undefined ? dto.instagramUserId : dto.instagramId;
    if (instagramRaw !== undefined || dto.telegramUserId !== undefined) {
      this.assertSocialLinkInputNotBoth(instagramRaw, dto.telegramUserId);
    }
    if (
      dto.instagramUserId !== undefined ||
      dto.instagramId !== undefined
    ) {
      row.instagramUserId = await this.resolveInstagramUserIdForWorkspace(
        workspaceId,
        instagramRaw,
        row.id,
      );
    }
    if (dto.telegramUserId !== undefined) {
      row.telegramUserId = await this.resolveTelegramUserIdForWorkspace(
        workspaceId,
        dto.telegramUserId,
        row.id,
      );
    }
    this.assertSingleSocialLink(row.instagramUserId, row.telegramUserId);

    await this.clientRepo.save(row);
    return this.toClientDto(row);
  }

  async deleteForOwner(ownerId: number, clientId: number): Promise<void> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const res = await this.clientRepo.delete({ id: clientId, workspaceId });
    if (res.affected === 0) {
      throw new NotFoundException("Client not found");
    }
  }

  /**
   * Looks up `clients.instagram_user_id` within the owner’s workspace.
   * Missing client → HTTP 200 with `{ associated: false, status: 'ok' }` (not 404).
   */
  async listPagedForOwner(
    ownerId: number,
    page: number,
    pageSize: number,
  ): Promise<ClientsListResponseDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const [rows, total] = await this.clientRepo.findAndCount({
      where: { workspaceId },
      order: { createdAt: "DESC" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      items: rows.map((r) => this.toClientDto(r)),
      total,
      page,
      pageSize,
    };
  }

  async lookupByInstagramIdForOwner(
    ownerId: number,
    instagramIdRaw: string,
  ): Promise<ClientLookupResponseDto> {
    const instagramUserId = instagramIdRaw.trim();
    if (!instagramUserId) {
      throw new BadRequestException(
        "instagramId query parameter is required and non-empty",
      );
    }

    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);

    const row = await this.clientRepo.findOne({
      where: { instagramUserId, workspaceId },
    });

    if (!row) {
      return { associated: false, status: "ok" };
    }

    return {
      associated: true,
      client: this.toClientDto(row),
    };
  }

  async getByIdForOwner(
    ownerId: number,
    clientId: number,
  ): Promise<ClientResponseDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const row = await this.clientRepo.findOne({
      where: { id: clientId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Client not found");
    }
    return this.toClientDto(row);
  }

  private parseSocialLinkInput(dto: CreateClientRequestDto): {
    instagramUserId: string | null | undefined;
    telegramUserId: string | null | undefined;
  } {
    const instagramUserId =
      dto.instagramUserId !== undefined ? dto.instagramUserId : dto.instagramId;
    const telegramUserId = dto.telegramUserId;
    this.assertSocialLinkInputNotBoth(instagramUserId, telegramUserId);
    return { instagramUserId, telegramUserId };
  }

  private assertSocialLinkInputNotBoth(
    instagramRaw: string | null | undefined,
    telegramRaw: string | null | undefined,
  ): void {
    const hasInstagram =
      instagramRaw !== undefined &&
      instagramRaw !== null &&
      String(instagramRaw).trim() !== "";
    const hasTelegram =
      telegramRaw !== undefined &&
      telegramRaw !== null &&
      String(telegramRaw).trim() !== "";
    if (hasInstagram && hasTelegram) {
      throw new BadRequestException(
        "Provide at most one of instagramUserId or telegramUserId",
      );
    }
  }

  private assertSingleSocialLink(
    instagramUserId: string | null,
    telegramUserId: string | null,
  ): void {
    if (instagramUserId && telegramUserId) {
      throw new BadRequestException(
        "Client cannot be linked to both Instagram and Telegram",
      );
    }
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
        "Another client in this workspace already uses this instagramId",
      );
    }

    return id;
  }

  private async resolveTelegramUserIdForWorkspace(
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

    const tg = await this.telegramUserRepo.findOne({ where: { id } });
    if (!tg) {
      throw new BadRequestException(
        `No telegram_users row for telegramUserId=${id}; sync or create the Telegram user first.`,
      );
    }

    const dupWhere: FindOptionsWhere<Client> = {
      workspaceId,
      telegramUserId: id,
    };
    if (excludeClientId != null) {
      dupWhere.id = Not(excludeClientId);
    }
    const dup = await this.clientRepo.exist({ where: dupWhere });
    if (dup) {
      throw new ConflictException(
        "Another client in this workspace already uses this telegramUserId",
      );
    }

    return id;
  }

  private toClientDto(row: Client): ClientResponseDto {
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      createdAt: row.createdAt,
      phone: row.phone,
      instagramUserId: row.instagramUserId,
      telegramUserId: row.telegramUserId,
      workspaceId: row.workspaceId,
    };
  }
}
