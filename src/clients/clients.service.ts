import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsWhere, In, Not, Repository } from "typeorm";
import { Client, InstagramUser, TelegramUser } from "../database/entities";
import { OrdersService } from "../orders/orders.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type { ClientOrderStatDto } from "./dto/client-order-stat.dto";
import type { ClientsListResponseDto } from "./dto/clients-list-response.dto";
import type { ClientLookupResponseDto } from "./dto/client-lookup-response.dto";
import type { ClientResponseDto } from "./dto/client-response.dto";
import type { CreateClientRequestDto } from "./dto/create-client-request.dto";
import type { ClientWriteResponseDto } from "./dto/client-write-response.dto";
import type { UpdateClientRequestDto } from "./dto/update-client-request.dto";

type ClientReadOptions = {
  includeOrderStat?: boolean;
};

type ClientSerializeOptions = ClientReadOptions & {
  includeAvatarSrc?: boolean;
};

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
    private readonly orders: OrdersService,
  ) {}

  async createForOwner(
    ownerId: number,
    dto: CreateClientRequestDto,
  ): Promise<ClientWriteResponseDto> {
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
    return this.toWriteClientDto(row);
  }

  async updateForOwner(
    ownerId: number,
    clientId: number,
    dto: UpdateClientRequestDto,
  ): Promise<ClientWriteResponseDto> {
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
    return this.toWriteClientDto(row);
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
    options?: ClientReadOptions,
  ): Promise<ClientsListResponseDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const [rows, total] = await this.clientRepo.findAndCount({
      where: { workspaceId },
      order: { createdAt: "DESC" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const items = await this.toClientDtos(rows, workspaceId, {
      includeOrderStat: options?.includeOrderStat === true,
      includeAvatarSrc: true,
    });
    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  async lookupByIdForOwner(
    ownerId: number,
    clientId: number,
    options?: ClientReadOptions,
  ): Promise<ClientLookupResponseDto> {
    return this.lookupOneInWorkspaceForOwner(
      ownerId,
      { id: clientId },
      options,
    );
  }

  async lookupByInstagramIdForOwner(
    ownerId: number,
    instagramIdRaw: string,
    options?: ClientReadOptions,
  ): Promise<ClientLookupResponseDto> {
    const instagramUserId = instagramIdRaw.trim();
    if (!instagramUserId) {
      throw new BadRequestException(
        "instagramUserId / instagramId query parameter is required and non-empty",
      );
    }

    return this.lookupOneInWorkspaceForOwner(
      ownerId,
      { instagramUserId },
      options,
    );
  }

  async lookupByTelegramUserIdForOwner(
    ownerId: number,
    telegramUserIdRaw: string,
    options?: ClientReadOptions,
  ): Promise<ClientLookupResponseDto> {
    const telegramUserId = telegramUserIdRaw.trim();
    if (!telegramUserId) {
      throw new BadRequestException(
        "telegramUserId query parameter is required and non-empty",
      );
    }

    return this.lookupOneInWorkspaceForOwner(
      ownerId,
      { telegramUserId },
      options,
    );
  }

  async getByIdForOwner(
    ownerId: number,
    clientId: number,
    options?: ClientReadOptions,
  ): Promise<ClientResponseDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const row = await this.clientRepo.findOne({
      where: { id: clientId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Client not found");
    }
    const [dto] = await this.toClientDtos([row], workspaceId, {
      includeOrderStat: options?.includeOrderStat === true,
      includeAvatarSrc: true,
    });
    return dto;
  }

  private async lookupOneInWorkspaceForOwner(
    ownerId: number,
    where: Pick<
      FindOptionsWhere<Client>,
      "id" | "instagramUserId" | "telegramUserId"
    >,
    options?: ClientReadOptions,
  ): Promise<ClientLookupResponseDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);

    const row = await this.clientRepo.findOne({
      where: { ...where, workspaceId },
    });

    if (!row) {
      return { associated: false, status: "ok" };
    }

    const [client] = await this.toClientDtos([row], workspaceId, {
      includeOrderStat: options?.includeOrderStat === true,
      includeAvatarSrc: true,
    });

    return {
      associated: true,
      client,
    };
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

  private async toClientDtos(
    rows: Client[],
    workspaceId: number,
    options: ClientSerializeOptions = {},
  ): Promise<ClientResponseDto[]> {
    if (rows.length === 0) {
      return [];
    }

    let statsByClientId: Map<number, ClientOrderStatDto> | undefined;
    if (options.includeOrderStat === true) {
      statsByClientId = await this.orders.getOrderStatsMapForClientIds(
        workspaceId,
        rows.map((row) => row.id),
      );
    }

    const avatarMaps =
      options.includeAvatarSrc === true
        ? await this.loadAvatarSrcMaps(rows)
        : undefined;

    return rows.map((row) =>
      this.toClientDto(row, {
        orderStats: statsByClientId?.get(row.id),
        avatarSrc:
          avatarMaps != null
            ? this.resolveAvatarSrc(row, avatarMaps)
            : undefined,
        includeAvatarSrc: options.includeAvatarSrc === true,
      }),
    );
  }

  private toWriteClientDto(row: Client): ClientWriteResponseDto {
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

  private async loadAvatarSrcMaps(rows: Client[]): Promise<{
    telegram: Map<string, string>;
    instagram: Map<string, string>;
  }> {
    const telegramIds = [
      ...new Set(
        rows
          .map((row) => row.telegramUserId?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const instagramIds = [
      ...new Set(
        rows
          .map((row) => row.instagramUserId?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const [telegramUsers, instagramUsers] = await Promise.all([
      telegramIds.length > 0
        ? this.telegramUserRepo.find({
            where: { id: In(telegramIds) },
            select: { id: true, profilePic: true },
          })
        : Promise.resolve([]),
      instagramIds.length > 0
        ? this.instagramUserRepo.find({
            where: { id: In(instagramIds) },
            select: { id: true, profilePic: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      telegram: new Map(
        telegramUsers.map((user) => [user.id, user.profilePic?.trim() ?? ""]),
      ),
      instagram: new Map(
        instagramUsers.map((user) => [user.id, user.profilePic?.trim() ?? ""]),
      ),
    };
  }

  private resolveAvatarSrc(
    row: Client,
    maps: { telegram: Map<string, string>; instagram: Map<string, string> },
  ): string | null {
    const telegramUserId = row.telegramUserId?.trim();
    if (telegramUserId) {
      const profilePic = maps.telegram.get(telegramUserId);
      return profilePic && profilePic.length > 0 ? profilePic : null;
    }

    const instagramUserId = row.instagramUserId?.trim();
    if (instagramUserId) {
      const profilePic = maps.instagram.get(instagramUserId);
      return profilePic && profilePic.length > 0 ? profilePic : null;
    }

    return null;
  }

  private toClientDto(
    row: Client,
    options?: {
      orderStats?: ClientOrderStatDto;
      avatarSrc?: string | null;
      includeAvatarSrc?: boolean;
    },
  ): ClientResponseDto {
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      createdAt: row.createdAt,
      phone: row.phone,
      instagramUserId: row.instagramUserId,
      telegramUserId: row.telegramUserId,
      workspaceId: row.workspaceId,
      ...(options?.includeAvatarSrc === true
        ? { avatar_src: options.avatarSrc ?? null }
        : {}),
      ...(options?.orderStats != null ? { orderStats: options.orderStats } : {}),
    };
  }
}
