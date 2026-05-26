import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  InstagramIntegration,
  TelegramIntegration,
  TelegramIntegrationStatus,
  Workspace,
} from "../database/entities";
import type { ConfirmTelegramCodeRequestDto } from "./dto/http/confirm-telegram-code-request.dto";
import type { ConfirmTelegramPasswordRequestDto } from "./dto/http/confirm-telegram-password-request.dto";
import type { StartTelegramIntegrationRequestDto } from "./dto/http/start-telegram-integration-request.dto";
import type { TelegramDialogsListResponseDto } from "./dto/http/telegram-dialog-response.dto";
import type { TelegramIntegrationResponseDto } from "./dto/http/telegram-integration-response.dto";
import type { TelegramIntegrationsListResponseDto } from "./dto/http/telegram-integrations-list-response.dto";
import { TelegramUpdatesListenerService } from "./telegram-updates-listener.service";
import { TelegramUserApiService } from "./telegram-user-api.service";

@Injectable()
export class TelegramIntegrationsService {
  constructor(
    @InjectRepository(TelegramIntegration)
    private readonly telegramRepo: Repository<TelegramIntegration>,
    @InjectRepository(InstagramIntegration)
    private readonly companyRepo: Repository<InstagramIntegration>,
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
    private readonly telegramApi: TelegramUserApiService,
    private readonly updatesListener: TelegramUpdatesListenerService,
  ) {}

  async listForOwner(
    ownerId: number,
    workspaceIdParam?: number,
  ): Promise<TelegramIntegrationsListResponseDto> {
    const workspaceId = await this.resolveWorkspaceIdForOwner(
      ownerId,
      workspaceIdParam,
    );
    const rows = await this.telegramRepo.find({
      where: { workspaceId },
      order: { id: "ASC" },
    });
    return {
      workspaceId,
      items: rows.map((r) => this.toDto(r)),
    };
  }

  async getOneForOwner(
    ownerId: number,
    id: number,
  ): Promise<TelegramIntegrationResponseDto> {
    const row = await this.requireOwnedRow(ownerId, id);
    return this.toDto(row);
  }

  async startForOwner(
    ownerId: number,
    dto: StartTelegramIntegrationRequestDto,
  ): Promise<TelegramIntegrationResponseDto> {
    const workspaceId = await this.resolveWorkspaceIdForOwner(
      ownerId,
      dto.workspace_id,
    );
    const phoneNumber = this.telegramApi.normalizePhoneNumber(dto.phone_number);

    const existing = await this.telegramRepo.findOne({
      where: { workspaceId, phoneNumber },
    });
    if (existing?.status === TelegramIntegrationStatus.ACTIVE) {
      throw new BadRequestException(
        "This phone is already connected for this workspace",
      );
    }

    const send = await this.telegramApi.sendLoginCode(phoneNumber);

    let row: TelegramIntegration;
    if (existing) {
      row = existing;
      row.status = TelegramIntegrationStatus.PENDING_CODE;
      row.name = phoneNumber;
      row.phoneCodeHash = send.phoneCodeHash;
      row.authSessionString = send.authSessionString;
      row.sessionString = null;
      row.telegramUserId = null;
      row.telegramUsername = null;
      row.connectedAt = null;
      row.lastError = null;
    } else {
      row = this.telegramRepo.create({
        workspaceId,
        ownerId,
        name: phoneNumber,
        phoneNumber,
        status: TelegramIntegrationStatus.PENDING_CODE,
        phoneCodeHash: send.phoneCodeHash,
        authSessionString: send.authSessionString,
      });
    }

    await this.telegramRepo.save(row);
    return this.toDto(row, {
      nextStep: send.isCodeViaApp
        ? "Enter the code from your Telegram app"
        : "Enter the code sent via SMS",
    });
  }

  async confirmCodeForOwner(
    ownerId: number,
    id: number,
    dto: ConfirmTelegramCodeRequestDto,
  ): Promise<TelegramIntegrationResponseDto> {
    const row = await this.requireOwnedRow(ownerId, id);
    if (
      row.status !== TelegramIntegrationStatus.PENDING_CODE &&
      row.status !== TelegramIntegrationStatus.PENDING_PASSWORD
    ) {
      throw new BadRequestException(
        "Integration is not awaiting a login code",
      );
    }

    const result = await this.telegramApi.confirmLoginCode(row, dto.code);

    if (result.kind === "password_required") {
      row.status = TelegramIntegrationStatus.PENDING_PASSWORD;
      row.authSessionString = result.authSessionString;
      row.phoneCodeHash = null;
      await this.telegramRepo.save(row);
      return this.toDto(row, {
        nextStep: "Account has 2FA enabled — submit your Telegram password",
      });
    }

    row.status = TelegramIntegrationStatus.ACTIVE;
    row.sessionString = result.sessionString;
    row.authSessionString = null;
    row.phoneCodeHash = null;
    row.telegramUserId = result.profile.telegramUserId;
    row.telegramUsername = result.profile.username;
    row.name = result.profile.displayName;
    row.connectedAt = new Date();
    row.lastError = null;
    await this.telegramRepo.save(row);
    await this.updatesListener.attachIntegration(row);
    return this.toDto(row);
  }

  async confirmPasswordForOwner(
    ownerId: number,
    id: number,
    dto: ConfirmTelegramPasswordRequestDto,
  ): Promise<TelegramIntegrationResponseDto> {
    const row = await this.requireOwnedRow(ownerId, id);
    if (row.status !== TelegramIntegrationStatus.PENDING_PASSWORD) {
      throw new BadRequestException(
        "Integration is not awaiting a 2FA password",
      );
    }
    const authSession = row.authSessionString?.trim();
    if (!authSession) {
      throw new BadRequestException(
        "Login session expired; start again with POST /telegram-integrations",
      );
    }

    const { profile, sessionString } = await this.telegramApi.confirmLoginPassword(
      authSession,
      dto.password,
    );

    row.status = TelegramIntegrationStatus.ACTIVE;
    row.sessionString = sessionString;
    row.authSessionString = null;
    row.phoneCodeHash = null;
    row.telegramUserId = profile.telegramUserId;
    row.telegramUsername = profile.username;
    row.name = profile.displayName;
    row.connectedAt = new Date();
    row.lastError = null;
    await this.telegramRepo.save(row);
    await this.updatesListener.attachIntegration(row);
    return this.toDto(row);
  }

  async disconnectForOwner(
    ownerId: number,
    id: number,
  ): Promise<TelegramIntegrationResponseDto> {
    const row = await this.requireOwnedRow(ownerId, id);
    await this.updatesListener.detachIntegration(id);
    row.status = TelegramIntegrationStatus.DISCONNECTED;
    row.sessionString = null;
    row.authSessionString = null;
    row.phoneCodeHash = null;
    row.connectedAt = null;
    await this.telegramRepo.save(row);
    return this.toDto(row);
  }

  /** Removes the integration row after detaching the live Telegram session. */
  async deleteForOwner(ownerId: number, id: number): Promise<void> {
    const row = await this.requireOwnedRow(ownerId, id);
    await this.updatesListener.detachIntegration(id);
    await this.telegramRepo.remove(row);
  }

  async listDialogsForOwner(
    ownerId: number,
    id: number,
    limitRaw?: number,
  ): Promise<TelegramDialogsListResponseDto> {
    const row = await this.requireOwnedRow(ownerId, id);
    if (row.status !== TelegramIntegrationStatus.ACTIVE || !row.sessionString) {
      throw new BadRequestException(
        "Telegram account is not connected; complete login first",
      );
    }
    const limit =
      limitRaw != null && Number.isFinite(limitRaw)
        ? Math.min(Math.max(Math.floor(limitRaw), 1), 100)
        : 50;
    const items = await this.telegramApi.getPrivateDialogs(
      row.sessionString,
      limit,
    );
    return { items };
  }

  /** For unified GET /integrations list. */
  mapToIntegrationListItem(
    row: TelegramIntegration,
  ): {
    type: "telegram";
    id: number;
    name: string;
    connectedAt?: string;
    status: TelegramIntegrationStatus;
  } {
    return {
      type: "telegram",
      id: row.id,
      name: row.name,
      status: row.status,
      ...(row.connectedAt != null && !Number.isNaN(row.connectedAt.getTime())
        ? { connectedAt: row.connectedAt.toISOString() }
        : {}),
    };
  }

  async findAllByWorkspace(workspaceId: number): Promise<TelegramIntegration[]> {
    return this.telegramRepo.find({
      where: { workspaceId },
      order: { id: "ASC" },
    });
  }

  async findActiveByWorkspace(
    workspaceId: number,
  ): Promise<TelegramIntegration[]> {
    return this.telegramRepo.find({
      where: {
        workspaceId,
        status: TelegramIntegrationStatus.ACTIVE,
      },
      order: { id: "ASC" },
    });
  }

  private toDto(
    row: TelegramIntegration,
    extra?: { nextStep?: string },
  ): TelegramIntegrationResponseDto {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      status: row.status,
      name: row.name,
      phoneNumber: row.phoneNumber,
      ...(row.telegramUserId ? { telegramUserId: row.telegramUserId } : {}),
      ...(row.telegramUsername
        ? { telegramUsername: row.telegramUsername }
        : {}),
      ...(row.connectedAt != null && !Number.isNaN(row.connectedAt.getTime())
        ? { connectedAt: row.connectedAt.toISOString() }
        : {}),
      ...(extra?.nextStep ? { nextStep: extra.nextStep } : {}),
    };
  }

  private async requireOwnedRow(
    ownerId: number,
    id: number,
  ): Promise<TelegramIntegration> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException("id must be a positive integer");
    }
    const row = await this.telegramRepo.findOne({ where: { id } });
    if (!row || row.ownerId !== ownerId) {
      throw new NotFoundException("Telegram integration not found");
    }
    return row;
  }

  private async resolveWorkspaceIdForOwner(
    ownerId: number,
    workspaceIdParam?: number,
  ): Promise<number> {
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain a numeric owner id",
      );
    }

    const anchor = await this.companyRepo.findOne({
      where: { ownerId },
      order: { id: "DESC" },
    });
    if (!anchor) {
      throw new NotFoundException(
        "Workspace not found; create a workspace / Instagram integration first",
      );
    }

    const workspaceId = workspaceIdParam ?? anchor.workspaceId;
    if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
      throw new BadRequestException("workspace_id must be a positive integer");
    }

    const workspace = await this.workspaceRepo.findOne({
      where: { id: workspaceId },
    });
    if (!workspace || workspace.ownerId !== ownerId) {
      throw new NotFoundException("Workspace not found for current user");
    }

    return workspaceId;
  }
}
