import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  TelegramIntegration,
  TelegramIntegrationStatus,
} from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type { ConfirmTelegramCodeRequestDto } from "./dto/http/confirm-telegram-code-request.dto";
import type { ConfirmTelegramPasswordRequestDto } from "./dto/http/confirm-telegram-password-request.dto";
import type { StartTelegramIntegrationRequestDto } from "./dto/http/start-telegram-integration-request.dto";
import type { TelegramDialogsListResponseDto } from "./dto/http/telegram-dialog-response.dto";
import type { TelegramIntegrationResponseDto } from "./dto/http/telegram-integration-response.dto";
import type { TelegramIntegrationsListResponseDto } from "./dto/http/telegram-integrations-list-response.dto";
import { TelegramUpdatesListenerService } from "./telegram-updates-listener.service";
import { TelegramUserApiService } from "./telegram-user-api.service";

const QR_LOGIN_PHONE_PREFIX = "qr:";
/** Fits `telegram_integrations.phone_number` varchar(32). */
const QR_LOGIN_PHONE_SUFFIX_LENGTH = 32 - QR_LOGIN_PHONE_PREFIX.length;

function buildQrLoginPlaceholderPhone(): string {
  return `${QR_LOGIN_PHONE_PREFIX}${randomBytes(16)
    .toString("hex")
    .slice(0, QR_LOGIN_PHONE_SUFFIX_LENGTH)}`;
}

@Injectable()
export class TelegramIntegrationsService {
  constructor(
    @InjectRepository(TelegramIntegration)
    private readonly telegramRepo: Repository<TelegramIntegration>,
    private readonly workspaceContext: WorkspaceAccessContextService,
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

    const send = await this.telegramApi.sendLoginCode(
      phoneNumber,
      dto.force_sms === true,
    );

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
      codeDelivery: send.isCodeViaApp ? "telegram_app" : "sms",
    });
  }

  async startQrLoginForOwner(
    ownerId: number,
    workspaceIdParam?: number,
  ): Promise<{
    integrationId: number;
    workspaceId: number;
    status: TelegramIntegrationStatus;
    qrLoginUrl: string;
    qrToken: string;
    qrImageUrl: string;
    expiresAt: string;
    nextStep: string;
  }> {
    const workspaceId = await this.resolveWorkspaceIdForOwner(
      ownerId,
      workspaceIdParam,
    );

    const qr = await this.telegramApi.startQrLogin();
    const placeholderPhone = buildQrLoginPlaceholderPhone();

    const row = this.telegramRepo.create({
      workspaceId,
      ownerId,
      name: "Telegram QR login",
      phoneNumber: placeholderPhone,
      status: TelegramIntegrationStatus.PENDING_QR,
      authSessionString: qr.authSessionString,
      phoneCodeHash: null,
      sessionString: null,
      telegramUserId: null,
      telegramUsername: null,
      connectedAt: null,
      lastError: null,
    });
    await this.telegramRepo.save(row);

    return {
      integrationId: row.id,
      workspaceId: row.workspaceId,
      status: row.status,
      qrLoginUrl: qr.qrLoginUrl,
      qrToken: qr.qrToken,
      qrImageUrl: qr.qrImageUrl,
      expiresAt: qr.expiresAt,
      nextStep:
        "Call POST /telegram-integrations/:id/qr-login/confirm right away (it waits up to 90s). " +
        "The user must scan the QR within ~30 seconds of expiresAt.",
    };
  }

  async confirmQrLoginForOwner(
    ownerId: number,
    id: number,
    waitTimeoutMs?: number,
  ): Promise<TelegramIntegrationResponseDto> {
    const row = await this.requireOwnedRow(ownerId, id);
    if (row.status !== TelegramIntegrationStatus.PENDING_QR) {
      if (row.status === TelegramIntegrationStatus.ACTIVE) {
        return this.toDto(row);
      }
      throw new BadRequestException(
        "Integration is not awaiting QR login confirmation",
      );
    }

    const authSession = row.authSessionString?.trim();
    if (!authSession) {
      throw new BadRequestException(
        "Login session expired; start again with POST /telegram-integrations/qr-login/start",
      );
    }

    let result: Awaited<ReturnType<typeof this.telegramApi.completeQrLogin>>;
    try {
      result = await this.telegramApi.completeQrLogin(
        authSession,
        waitTimeoutMs,
      );
    } catch (e) {
      if (
        e instanceof BadRequestException &&
        this.isQrTokenExpiredMessage(String(e.message))
      ) {
        row.authSessionString = null;
        row.lastError = "QR token expired";
        await this.telegramRepo.save(row);
      }
      throw e;
    }

    if (result.kind === "password_required") {
      row.status = TelegramIntegrationStatus.PENDING_PASSWORD;
      row.authSessionString = result.authSessionString;
      await this.telegramRepo.save(row);
      return this.toDto(row, {
        nextStep: "Account has 2FA enabled — submit your Telegram password",
      });
    }

    await this.applyActiveTelegramProfile(row, result.profile, result.sessionString);
    await this.telegramRepo.save(row);
    await this.updatesListener.attachIntegration(row);
    return this.toDto(row);
  }

  private async applyActiveTelegramProfile(
    row: TelegramIntegration,
    profile: {
      telegramUserId: string;
      username: string | null;
      displayName: string;
      phoneNumber: string | null;
    },
    sessionString: string,
  ): Promise<void> {
    if (profile.phoneNumber) {
      const existing = await this.telegramRepo.findOne({
        where: {
          workspaceId: row.workspaceId,
          phoneNumber: profile.phoneNumber,
        },
      });
      if (
        existing &&
        existing.id !== row.id &&
        existing.status === TelegramIntegrationStatus.ACTIVE
      ) {
        throw new BadRequestException(
          "This phone is already connected for this workspace",
        );
      }
      row.phoneNumber = profile.phoneNumber;
    }

    row.status = TelegramIntegrationStatus.ACTIVE;
    row.sessionString = sessionString;
    row.authSessionString = null;
    row.phoneCodeHash = null;
    row.telegramUserId = profile.telegramUserId;
    row.telegramUsername = profile.username;
    row.name = profile.displayName;
    row.connectedAt = new Date();
    row.lastError = null;
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

    await this.applyActiveTelegramProfile(row, result.profile, result.sessionString);
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

    await this.applyActiveTelegramProfile(row, profile, sessionString);
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
    const connectedClient = this.updatesListener.getActiveClient(id);
    const items = await this.telegramApi.getPrivateDialogs(
      row.sessionString,
      limit,
      connectedClient ? { connectedClient } : undefined,
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
      name: this.resolveIntegrationListName(row),
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

  private resolveIntegrationListName(row: TelegramIntegration): string {
    const phone = row.phoneNumber?.trim();
    if (phone && !phone.startsWith(QR_LOGIN_PHONE_PREFIX)) {
      return phone;
    }
    return row.name?.trim() || `Telegram #${row.id}`;
  }

  private isQrTokenExpiredMessage(message: string): boolean {
    return (
      message.includes("AUTH_TOKEN_EXPIRED") ||
      message.includes("QR code expired")
    );
  }

  private toDto(
    row: TelegramIntegration,
    extra?: { nextStep?: string; codeDelivery?: "telegram_app" | "sms" },
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
      ...(extra?.codeDelivery ? { codeDelivery: extra.codeDelivery } : {}),
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
    return this.workspaceContext.resolveWorkspaceIdForOwner(
      ownerId,
      workspaceIdParam,
    );
  }
}
