import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  Client,
  ClientLink,
  ClientLinkProvider,
  ClientWishlistItem,
  InstagramUser,
  Product,
  ProductVariant,
  TelegramUser,
} from "../database/entities";
import { OrdersService } from "../orders/orders.service";
import { ProductsService } from "../products/products.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type { AddClientWishlistRequestDto } from "./dto/add-client-wishlist-request.dto";
import type { ClientWishlistItemResponseDto } from "./dto/client-wishlist-item-response.dto";
import type { ClientWishlistProductsResponseDto } from "./dto/client-wishlist-products-response.dto";
import type { RemoveClientWishlistRequestDto } from "./dto/remove-client-wishlist-request.dto";
import type { ClientSocialIds } from "./dto/client-link-input.util";
import type { ClientOrderStatDto } from "./dto/client-order-stat.dto";
import type { ClientsListResponseDto } from "./dto/clients-list-response.dto";
import type { ClientLookupResponseDto } from "./dto/client-lookup-response.dto";
import type {
  ClientResponseDto,
  ClientSocialUserDto,
} from "./dto/client-response.dto";
import type { CreateClientRequestDto } from "./dto/create-client-request.dto";
import type { ClientWriteResponseDto } from "./dto/client-write-response.dto";
import type { UpdateClientRequestDto } from "./dto/update-client-request.dto";

type ClientReadOptions = {
  includeOrderStat?: boolean;
  keyword?: string;
};

type ClientSerializeOptions = ClientReadOptions & {
  includeAvatarSrc?: boolean;
};

type ClientSocialProfileMaps = {
  telegram: Map<string, ClientSocialUserDto>;
  instagram: Map<string, ClientSocialUserDto>;
};

const EMPTY_SOCIAL_IDS: ClientSocialIds = {
  instagramUserIds: [],
  telegramUserIds: [],
};

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(ClientLink)
    private readonly clientLinkRepo: Repository<ClientLink>,
    @InjectRepository(ClientWishlistItem)
    private readonly clientWishlistRepo: Repository<ClientWishlistItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly productVariantRepo: Repository<ProductVariant>,
    @InjectRepository(InstagramUser)
    private readonly instagramUserRepo: Repository<InstagramUser>,
    @InjectRepository(TelegramUser)
    private readonly telegramUserRepo: Repository<TelegramUser>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly orders: OrdersService,
    private readonly products: ProductsService,
  ) {}

  async createForOwner(
    ownerId: number,
    dto: CreateClientRequestDto,
  ): Promise<ClientWriteResponseDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const instagramUserIds = dto.resolvedInstagramUserIds() ?? [];
    const telegramUserIds = dto.resolvedTelegramUserIds() ?? [];

    const row = this.clientRepo.create({
      firstName: (dto.first_name?.trim() ?? "") || "",
      lastName: (dto.last_name?.trim() ?? "") || "",
      phone: (dto.phone?.trim() ?? "") || "",
      workspaceId,
    });

    return this.clientRepo.manager.transaction(async (em) => {
      const clientRepo = em.getRepository(Client);
      const linkRepo = em.getRepository(ClientLink);
      const saved = await clientRepo.save(row);
      await this.replaceClientLinksInTransaction(linkRepo, {
        clientId: saved.id,
        workspaceId,
        instagramUserIds,
        telegramUserIds,
      });
      const socialIds = { instagramUserIds, telegramUserIds };
      return this.toWriteClientDto(saved, socialIds);
    });
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

    const instagramUserIds = dto.resolvedInstagramUserIds();
    const telegramUserIds = dto.resolvedTelegramUserIds();

    return this.clientRepo.manager.transaction(async (em) => {
      const clientRepo = em.getRepository(Client);
      const linkRepo = em.getRepository(ClientLink);
      const saved = await clientRepo.save(row);

      if (instagramUserIds !== undefined) {
        await this.replaceProviderLinksInTransaction(
          linkRepo,
          saved.id,
          workspaceId,
          ClientLinkProvider.INSTAGRAM,
          instagramUserIds,
        );
      }
      if (telegramUserIds !== undefined) {
        await this.replaceProviderLinksInTransaction(
          linkRepo,
          saved.id,
          workspaceId,
          ClientLinkProvider.TELEGRAM,
          telegramUserIds,
        );
      }

      const socialIds = await this.loadSocialIdsByClientIds([saved.id]);
      return this.toWriteClientDto(
        saved,
        socialIds.get(saved.id) ?? EMPTY_SOCIAL_IDS,
      );
    });
  }

  async deleteForOwner(ownerId: number, clientId: number): Promise<void> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const res = await this.clientRepo.delete({ id: clientId, workspaceId });
    if (res.affected === 0) {
      throw new NotFoundException("Client not found");
    }
  }

  async listPagedForOwner(
    ownerId: number,
    page: number,
    pageSize: number,
    options?: ClientReadOptions,
  ): Promise<ClientsListResponseDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);

    const qb = this.clientRepo
      .createQueryBuilder("c")
      .where("c.workspaceId = :workspaceId", { workspaceId });

    const keyword = options?.keyword?.trim();
    if (keyword) {
      const pattern = `%${this.escapePgIlikePattern(keyword)}%`;
      qb.andWhere(
        `(c.firstName ILIKE :pattern ESCAPE '\\'
          OR c.lastName ILIKE :pattern ESCAPE '\\'
          OR c.phone ILIKE :pattern ESCAPE '\\'
          OR (c.firstName || ' ' || c.lastName) ILIKE :pattern ESCAPE '\\')`,
        { pattern },
      );
    }

    const [rows, total] = await qb
      .orderBy("c.createdAt", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

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
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const row = await this.clientRepo.findOne({
      where: { id: clientId, workspaceId },
    });
    if (!row) {
      return { associated: false, status: "ok" };
    }
    return this.clientLookupFromRow(row, workspaceId, options);
  }

  async lookupByInstagramIdForOwner(
    ownerId: number,
    instagramIdRaw: string,
    options?: ClientReadOptions,
  ): Promise<ClientLookupResponseDto> {
    const externalId = instagramIdRaw.trim();
    if (!externalId) {
      throw new BadRequestException(
        "instagramUserId / instagramId query parameter is required and non-empty",
      );
    }
    return this.lookupByExternalIdForOwner(
      ownerId,
      ClientLinkProvider.INSTAGRAM,
      externalId,
      options,
    );
  }

  async lookupByTelegramUserIdForOwner(
    ownerId: number,
    telegramUserIdRaw: string,
    options?: ClientReadOptions,
  ): Promise<ClientLookupResponseDto> {
    const externalId = telegramUserIdRaw.trim();
    if (!externalId) {
      throw new BadRequestException(
        "telegramUserId query parameter is required and non-empty",
      );
    }
    return this.lookupByExternalIdForOwner(
      ownerId,
      ClientLinkProvider.TELEGRAM,
      externalId,
      options,
    );
  }

  async addLinkForOwner(
    ownerId: number,
    clientId: number,
    provider: ClientLinkProvider,
    externalIdRaw: string,
  ): Promise<ClientWriteResponseDto> {
    const externalId = externalIdRaw.trim();
    if (!externalId) {
      throw new BadRequestException("externalId is required and non-empty");
    }

    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const row = await this.clientRepo.findOne({
      where: { id: clientId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Client not found");
    }

    await this.assertExternalUserExists(provider, externalId, workspaceId);

    const existing = await this.clientLinkRepo.findOne({
      where: { workspaceId, provider, externalId },
    });
    if (existing) {
      if (existing.clientId === clientId) {
        const socialIds = await this.loadSocialIdsByClientIds([clientId]);
        return this.toWriteClientDto(
          row,
          socialIds.get(clientId) ?? EMPTY_SOCIAL_IDS,
        );
      }
      const label =
        provider === ClientLinkProvider.INSTAGRAM
          ? "instagramId"
          : "telegramUserId";
      throw new ConflictException(
        `Another client in this workspace already uses this ${label}`,
      );
    }

    await this.clientLinkRepo.save(
      this.clientLinkRepo.create({
        clientId,
        workspaceId,
        provider,
        externalId,
      }),
    );

    return this.writeClientDtoWithLinks(row, clientId);
  }

  async removeLinkForOwner(
    ownerId: number,
    clientId: number,
    provider: ClientLinkProvider,
    externalIdRaw: string,
  ): Promise<ClientWriteResponseDto> {
    const externalId = externalIdRaw.trim();
    if (!externalId) {
      throw new BadRequestException("externalId is required and non-empty");
    }

    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const row = await this.clientRepo.findOne({
      where: { id: clientId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Client not found");
    }

    await this.clientLinkRepo.delete({
      clientId,
      workspaceId,
      provider,
      externalId,
    });

    return this.writeClientDtoWithLinks(row, clientId);
  }

  async addWishlistItemForOwner(
    ownerId: number,
    clientId: number,
    dto: AddClientWishlistRequestDto,
  ): Promise<ClientWishlistItemResponseDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const client = await this.clientRepo.findOne({
      where: { id: clientId, workspaceId },
    });
    if (!client) {
      throw new NotFoundException("Client not found");
    }

    const product = await this.productRepo.findOne({
      where: { id: dto.productId, workspaceId },
    });
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const variant = await this.productVariantRepo.findOne({
      where: { id: dto.variantId, productId: product.id },
    });
    if (!variant) {
      throw new BadRequestException("variantId does not belong to productId");
    }

    const at = dto.at ? new Date(dto.at) : new Date();
    if (Number.isNaN(at.getTime())) {
      throw new BadRequestException("at must be a valid ISO date string");
    }

    const existing = await this.clientWishlistRepo.findOne({
      where: {
        clientId,
        productId: dto.productId,
        variantId: dto.variantId,
      },
    });
    if (existing) {
      return this.toWishlistItemDto(existing);
    }

    const row = await this.clientWishlistRepo.save(
      this.clientWishlistRepo.create({
        clientId,
        workspaceId,
        productId: dto.productId,
        variantId: dto.variantId,
        at,
        createdById: ownerId,
        conversationId: dto.conversationId ?? null,
      }),
    );

    return this.toWishlistItemDto(row);
  }

  async removeWishlistItemForOwner(
    ownerId: number,
    clientId: number,
    dto: RemoveClientWishlistRequestDto,
  ): Promise<void> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const client = await this.clientRepo.findOne({
      where: { id: clientId, workspaceId },
    });
    if (!client) {
      throw new NotFoundException("Client not found");
    }

    await this.clientWishlistRepo.delete({
      clientId,
      workspaceId,
      productId: dto.productId,
      variantId: dto.variantId,
    });
  }

  async listWishlistProductsForOwner(
    ownerId: number,
    clientId: number,
  ): Promise<ClientWishlistProductsResponseDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const client = await this.clientRepo.findOne({
      where: { id: clientId, workspaceId },
    });
    if (!client) {
      throw new NotFoundException("Client not found");
    }

    const rows = await this.clientWishlistRepo.find({
      where: { clientId, workspaceId },
      order: { at: "DESC", id: "DESC" },
    });

    const items = await this.products.listListItemsForInstagramReferences(
      ownerId,
      rows.map((row) => ({
        referenceId: row.id,
        productId: row.productId,
        productVariantId: row.variantId,
      })),
    );

    return { clientId, items };
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

  private async lookupByExternalIdForOwner(
    ownerId: number,
    provider: ClientLinkProvider,
    externalId: string,
    options?: ClientReadOptions,
  ): Promise<ClientLookupResponseDto> {
    const workspaceId =
      await this.workspaceContext.resolveWorkspaceIdForOwner(ownerId);
    const link = await this.clientLinkRepo.findOne({
      where: { workspaceId, provider, externalId },
    });
    if (!link) {
      return { associated: false, status: "ok" };
    }
    const row = await this.clientRepo.findOne({
      where: { id: link.clientId, workspaceId },
    });
    if (!row) {
      return { associated: false, status: "ok" };
    }
    return this.clientLookupFromRow(row, workspaceId, options);
  }

  private async clientLookupFromRow(
    row: Client,
    workspaceId: number,
    options?: ClientReadOptions,
  ): Promise<ClientLookupResponseDto> {
    const [client] = await this.toClientDtos([row], workspaceId, {
      includeOrderStat: options?.includeOrderStat === true,
      includeAvatarSrc: true,
    });
    return { associated: true, client };
  }

  private async replaceClientLinksInTransaction(
    linkRepo: Repository<ClientLink>,
    params: {
      clientId: number;
      workspaceId: number;
      instagramUserIds: string[];
      telegramUserIds: string[];
    },
  ): Promise<void> {
    await this.replaceProviderLinksInTransaction(
      linkRepo,
      params.clientId,
      params.workspaceId,
      ClientLinkProvider.INSTAGRAM,
      params.instagramUserIds,
    );
    await this.replaceProviderLinksInTransaction(
      linkRepo,
      params.clientId,
      params.workspaceId,
      ClientLinkProvider.TELEGRAM,
      params.telegramUserIds,
    );
  }

  private async replaceProviderLinksInTransaction(
    linkRepo: Repository<ClientLink>,
    clientId: number,
    workspaceId: number,
    provider: ClientLinkProvider,
    externalIds: string[],
  ): Promise<void> {
    const uniqueIds = [
      ...new Set(externalIds.map((id) => id.trim()).filter(Boolean)),
    ];
    for (const externalId of uniqueIds) {
      await this.assertExternalUserExists(provider, externalId, workspaceId);
      await this.assertExternalIdAvailable(
        linkRepo,
        workspaceId,
        provider,
        externalId,
        clientId,
      );
    }

    await linkRepo.delete({ clientId, provider });
    if (uniqueIds.length === 0) {
      return;
    }

    await linkRepo.save(
      uniqueIds.map((externalId) =>
        linkRepo.create({
          clientId,
          workspaceId,
          provider,
          externalId,
        }),
      ),
    );
  }

  private async assertExternalUserExists(
    provider: ClientLinkProvider,
    externalId: string,
    workspaceId: number,
  ): Promise<void> {
    if (provider === ClientLinkProvider.INSTAGRAM) {
      const ig = await this.instagramUserRepo.findOne({
        where: { workspaceId, id: externalId },
      });
      if (!ig) {
        throw new BadRequestException(
          `No instagram_users row for instagramId=${externalId}; sync or create the Instagram user first.`,
        );
      }
      return;
    }

    const tg = await this.telegramUserRepo.findOne({
      where: { workspaceId, id: externalId },
    });
    if (!tg) {
      throw new BadRequestException(
        `No telegram_users row for telegramUserId=${externalId}; sync or create the Telegram user first.`,
      );
    }
  }

  private async assertExternalIdAvailable(
    linkRepo: Repository<ClientLink>,
    workspaceId: number,
    provider: ClientLinkProvider,
    externalId: string,
    clientId: number,
  ): Promise<void> {
    const existing = await linkRepo.findOne({
      where: { workspaceId, provider, externalId },
    });
    if (existing && existing.clientId !== clientId) {
      const label =
        provider === ClientLinkProvider.INSTAGRAM
          ? "instagramId"
          : "telegramUserId";
      throw new ConflictException(
        `Another client in this workspace already uses this ${label}`,
      );
    }
  }

  private async loadSocialIdsByClientIds(
    clientIds: number[],
  ): Promise<Map<number, ClientSocialIds>> {
    const map = new Map<number, ClientSocialIds>();
    for (const clientId of clientIds) {
      map.set(clientId, {
        instagramUserIds: [],
        telegramUserIds: [],
      });
    }
    if (clientIds.length === 0) {
      return map;
    }

    const links = await this.clientLinkRepo.find({
      where: { clientId: In(clientIds) },
      order: { id: "ASC" },
    });

    for (const link of links) {
      const bucket = map.get(link.clientId);
      if (!bucket) continue;
      if (link.provider === ClientLinkProvider.INSTAGRAM) {
        bucket.instagramUserIds.push(link.externalId);
      } else {
        bucket.telegramUserIds.push(link.externalId);
      }
    }

    return map;
  }

  private async toClientDtos(
    rows: Client[],
    workspaceId: number,
    options: ClientSerializeOptions = {},
  ): Promise<ClientResponseDto[]> {
    if (rows.length === 0) {
      return [];
    }

    const clientIds = rows.map((row) => row.id);
    const socialIdsByClientId = await this.loadSocialIdsByClientIds(clientIds);

    let statsByClientId: Map<number, ClientOrderStatDto> | undefined;
    if (options.includeOrderStat === true) {
      statsByClientId = await this.orders.getOrderStatsMapForClientIds(
        workspaceId,
        clientIds,
      );
    }

    const socialProfileMaps =
      options.includeAvatarSrc === true
        ? await this.loadSocialProfileMaps(workspaceId, socialIdsByClientId)
        : undefined;

    return rows.map((row) => {
      const socialIds = socialIdsByClientId.get(row.id) ?? EMPTY_SOCIAL_IDS;
      return this.toClientDto(row, socialIds, {
        orderStats: statsByClientId?.get(row.id),
        avatarSrc:
          socialProfileMaps != null
            ? this.resolveAvatarSrc(socialIds, socialProfileMaps)
            : undefined,
        socialProfiles:
          socialProfileMaps != null
            ? this.resolveSocialProfiles(socialIds, socialProfileMaps)
            : undefined,
        includeAvatarSrc: options.includeAvatarSrc === true,
      });
    });
  }

  private async writeClientDtoWithLinks(
    row: Client,
    clientId: number,
  ): Promise<ClientWriteResponseDto> {
    const socialIds = await this.loadSocialIdsByClientIds([clientId]);
    return this.toWriteClientDto(
      row,
      socialIds.get(clientId) ?? EMPTY_SOCIAL_IDS,
    );
  }

  private toWriteClientDto(
    row: Client,
    socialIds: ClientSocialIds,
  ): ClientWriteResponseDto {
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      createdAt: row.createdAt,
      phone: row.phone,
      instagramUserIds: socialIds.instagramUserIds,
      telegramUserIds: socialIds.telegramUserIds,
      workspaceId: row.workspaceId,
    };
  }

  private async loadSocialProfileMaps(
    workspaceId: number,
    socialIdsByClientId: Map<number, ClientSocialIds>,
  ): Promise<ClientSocialProfileMaps> {
    const telegramIds = new Set<string>();
    const instagramIds = new Set<string>();
    for (const socialIds of socialIdsByClientId.values()) {
      for (const id of socialIds.telegramUserIds) telegramIds.add(id);
      for (const id of socialIds.instagramUserIds) instagramIds.add(id);
    }

    const [telegramUsers, instagramUsers] = await Promise.all([
      telegramIds.size > 0
        ? this.telegramUserRepo.find({
            where: { workspaceId, id: In([...telegramIds]) },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              profilePic: true,
            },
          })
        : Promise.resolve([]),
      instagramIds.size > 0
        ? this.instagramUserRepo.find({
            where: { workspaceId, id: In([...instagramIds]) },
            select: {
              id: true,
              name: true,
              username: true,
              profilePic: true,
            },
          })
        : Promise.resolve([]),
    ]);

    return {
      telegram: new Map(
        telegramUsers.map((user) => [
          user.id,
          {
            id: user.id,
            username: user.username?.trim() || null,
            fullName: [user.firstName?.trim(), user.lastName?.trim()]
              .filter(Boolean)
              .join(" "),
            avatar: user.profilePic?.trim() || null,
          },
        ]),
      ),
      instagram: new Map(
        instagramUsers.map((user) => [
          user.id,
          {
            id: user.id,
            username: user.username?.trim() || null,
            fullName: user.name?.trim() || "",
            avatar: user.profilePic?.trim() || null,
          },
        ]),
      ),
    };
  }

  private resolveAvatarSrc(
    socialIds: ClientSocialIds,
    maps: ClientSocialProfileMaps,
  ): string | null {
    for (const telegramUserId of socialIds.telegramUserIds) {
      const profilePic = maps.telegram.get(telegramUserId)?.avatar;
      if (profilePic && profilePic.length > 0) {
        return profilePic;
      }
    }
    for (const instagramUserId of socialIds.instagramUserIds) {
      const profilePic = maps.instagram.get(instagramUserId)?.avatar;
      if (profilePic && profilePic.length > 0) {
        return profilePic;
      }
    }
    return null;
  }

  private resolveSocialProfiles(
    socialIds: ClientSocialIds,
    maps: ClientSocialProfileMaps,
  ): {
    instagramUsers: ClientSocialUserDto[];
    telegramUsers: ClientSocialUserDto[];
  } {
    return {
      instagramUsers: socialIds.instagramUserIds.map(
        (id) =>
          maps.instagram.get(id) ?? {
            id,
            username: null,
            fullName: "",
            avatar: null,
          },
      ),
      telegramUsers: socialIds.telegramUserIds.map(
        (id) =>
          maps.telegram.get(id) ?? {
            id,
            username: null,
            fullName: "",
            avatar: null,
          },
      ),
    };
  }

  private toClientDto(
    row: Client,
    socialIds: ClientSocialIds,
    options?: {
      orderStats?: ClientOrderStatDto;
      avatarSrc?: string | null;
      socialProfiles?: {
        instagramUsers: ClientSocialUserDto[];
        telegramUsers: ClientSocialUserDto[];
      };
      includeAvatarSrc?: boolean;
    },
  ): ClientResponseDto {
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      createdAt: row.createdAt,
      phone: row.phone,
      instagramUserIds: socialIds.instagramUserIds,
      telegramUserIds: socialIds.telegramUserIds,
      instagramUsers: options?.socialProfiles?.instagramUsers ?? [],
      telegramUsers: options?.socialProfiles?.telegramUsers ?? [],
      workspaceId: row.workspaceId,
      ...(options?.includeAvatarSrc === true
        ? { avatar_src: options.avatarSrc ?? null }
        : {}),
      ...(options?.orderStats != null
        ? { orderStats: options.orderStats }
        : {}),
    };
  }

  private toWishlistItemDto(
    row: ClientWishlistItem,
  ): ClientWishlistItemResponseDto {
    return {
      id: row.id,
      productId: row.productId,
      variantId: row.variantId,
      at: row.at,
      createdBy: row.createdById,
      conversationId: row.conversationId,
    };
  }

  private escapePgIlikePattern(value: string): string {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
  }
}
