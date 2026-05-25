import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import bigInt from "big-integer";
import { Api, TelegramClient, utils } from "telegram";
import type { EntityLike } from "telegram/define";
import { StringSession } from "telegram/sessions";
import type { TelegramIntegration } from "../database/entities/telegram-integration.entity";

export type TelegramApiCredentials = {
  apiId: number;
  apiHash: string;
};

export type TelegramSendCodeResult = {
  phoneCodeHash: string;
  isCodeViaApp: boolean;
  authSessionString: string;
};

export type TelegramUserProfile = {
  telegramUserId: string;
  username: string | null;
  displayName: string;
};

export type TelegramPrivateDialogDto = {
  id: string;
  title: string;
  isUser: boolean;
  isGroup: boolean;
  unreadCount?: number;
};

export type TelegramSendPrivateMessageResult = {
  messageId: number;
  chatId: string;
  date: Date;
};

@Injectable()
export class TelegramUserApiService {
  private readonly log = new Logger(TelegramUserApiService.name);

  constructor(private readonly config: ConfigService) {}

  getCredentials(): TelegramApiCredentials {
    const apiIdRaw =
      this.config.get<string>("TELEGRAM_API_ID")?.trim() ??
      this.config.get<string>("TG_API_ID")?.trim();
    const apiHash =
      this.config.get<string>("TELEGRAM_API_HASH")?.trim() ??
      this.config.get<string>("TG_API_HASH")?.trim();
    const apiId = apiIdRaw ? Number.parseInt(apiIdRaw, 10) : Number.NaN;
    if (!Number.isFinite(apiId) || apiId <= 0 || !apiHash) {
      throw new BadRequestException(
        "Telegram user API is not configured (TELEGRAM_API_ID / TELEGRAM_API_HASH from https://my.telegram.org)",
      );
    }
    return { apiId, apiHash };
  }

  normalizePhoneNumber(raw: string): string {
    const trimmed = raw.trim().replace(/[\s()-]/g, "");
    if (!/^\+[1-9]\d{6,14}$/.test(trimmed)) {
      throw new BadRequestException(
        "phone_number must be E.164 format, e.g. +380501234567",
      );
    }
    return trimmed;
  }

  async sendLoginCode(phoneNumber: string): Promise<TelegramSendCodeResult> {
    const creds = this.getCredentials();
    const client = this.createClient("");
    try {
      await client.connect();
      const { phoneCodeHash, isCodeViaApp } = await client.sendCode(
        creds,
        phoneNumber,
      );
      const authSessionString = this.saveSession(client);
      return { phoneCodeHash, isCodeViaApp, authSessionString };
    } catch (e) {
      throw this.toHttpError(e, "Failed to send Telegram login code");
    } finally {
      await this.safeDisconnect(client);
    }
  }

  async confirmLoginCode(
    row: Pick<
      TelegramIntegration,
      "phoneNumber" | "phoneCodeHash" | "authSessionString"
    >,
    code: string,
  ): Promise<
    | { kind: "active"; profile: TelegramUserProfile; sessionString: string }
    | { kind: "password_required"; authSessionString: string }
  > {
    const creds = this.getCredentials();
    const phoneCode = code.trim();
    if (!/^\d{4,8}$/.test(phoneCode)) {
      throw new BadRequestException("code must be 4–8 digits");
    }
    const hash = row.phoneCodeHash?.trim();
    const authSession = row.authSessionString?.trim();
    if (!hash || !authSession) {
      throw new BadRequestException(
        "Login session expired; start again with POST /telegram-integrations",
      );
    }

    const client = this.createClient(authSession);
    try {
      await client.connect();
      try {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: row.phoneNumber,
            phoneCodeHash: hash,
            phoneCode,
          }),
        );
      } catch (e) {
        if (this.isPasswordRequired(e)) {
          const nextAuthSession = this.saveSession(client);
          return {
            kind: "password_required",
            authSessionString: nextAuthSession,
          };
        }
        throw e;
      }

      const profile = await this.readProfile(client);
      const sessionString = this.saveSession(client);
      return { kind: "active", profile, sessionString };
    } catch (e) {
      throw this.toHttpError(e, "Telegram login code verification failed");
    } finally {
      await this.safeDisconnect(client);
    }
  }

  async confirmLoginPassword(
    authSessionString: string,
    password: string,
  ): Promise<{ profile: TelegramUserProfile; sessionString: string }> {
    const creds = this.getCredentials();
    const pwd = password.trim();
    if (!pwd) {
      throw new BadRequestException("password must not be empty");
    }
    const client = this.createClient(authSessionString);
    try {
      await client.connect();
      await client.signInWithPassword(creds, {
        password: async () => pwd,
        onError: (err) => {
          throw err;
        },
      });
      const profile = await this.readProfile(client);
      const sessionString = this.saveSession(client);
      return { profile, sessionString };
    } catch (e) {
      throw this.toHttpError(e, "Telegram 2FA verification failed");
    } finally {
      await this.safeDisconnect(client);
    }
  }

  async getPrivateDialogs(
    sessionString: string,
    limit = 50,
  ): Promise<TelegramPrivateDialogDto[]> {
    const client = this.createClient(sessionString);
    try {
      await client.connect();
      if (!(await client.isUserAuthorized())) {
        throw new BadRequestException("Telegram session is not authorized");
      }
      const dialogs = await client.getDialogs({ limit });
      return dialogs.map((d) => {
        const entity = d.entity;
        const isUser = entity instanceof Api.User;
        const isGroup =
          entity instanceof Api.Chat ||
          entity instanceof Api.Channel;
        const id = d.id?.toString() ?? "";
        return {
          id,
          title: d.title ?? d.name ?? id,
          isUser,
          isGroup,
          unreadCount: d.unreadCount,
        };
      });
    } catch (e) {
      throw this.toHttpError(e, "Failed to load Telegram dialogs");
    } finally {
      await this.safeDisconnect(client);
    }
  }

  async sendPrivateMessage(
    sessionString: string,
    peerUserId: string,
    text: string,
    options?: {
      replyToMessageId?: number;
      /** Reuse the long-lived listener client (entity cache already warm). */
      connectedClient?: TelegramClient;
    },
  ): Promise<TelegramSendPrivateMessageResult> {
    const peer = peerUserId.trim();
    if (!peer || !/^\d+$/.test(peer)) {
      throw new BadRequestException(
        "peer user id must be a numeric Telegram user id",
      );
    }

    const ownsClient = options?.connectedClient == null;
    const client = options?.connectedClient ?? this.createClient(sessionString);
    try {
      if (ownsClient) {
        await client.connect();
        if (!(await client.isUserAuthorized())) {
          throw new BadRequestException("Telegram session is not authorized");
        }
      }

      const target = await this.resolvePrivateMessagePeer(client, peer);
      const sendOpts: { message: string; replyTo?: number } = { message: text };
      if (options?.replyToMessageId != null) {
        sendOpts.replyTo = options.replyToMessageId;
      }
      const sent = await client.sendMessage(target, sendOpts);
      const messageId = sent?.id;
      if (messageId == null) {
        throw new BadGatewayException("Telegram did not return a message id");
      }
      const date =
        typeof sent.date === "number"
          ? new Date(sent.date * 1000)
          : new Date();
      return {
        messageId: Number(messageId),
        chatId: peer,
        date,
      };
    } catch (e) {
      throw this.toHttpError(e, "Failed to send Telegram message");
    } finally {
      if (ownsClient) {
        await this.safeDisconnect(client);
      }
    }
  }

  /**
   * GramJS needs a resolved InputPeer (access hash). A bare numeric user id is not enough
   * on a cold client — load dialogs / entities first (see Telethon entity docs).
   */
  private async resolvePrivateMessagePeer(
    client: TelegramClient,
    peerUserId: string,
  ): Promise<EntityLike> {
    try {
      return await client.getInputEntity(peerUserId);
    } catch {
      /* cache / session miss — resolve below */
    }

    try {
      const dialogs = await client.getDialogs({ limit: 200 });
      for (const dialog of dialogs) {
        const entity = dialog.entity;
        if (!entity) {
          continue;
        }
        const peerId = utils.getPeerId(entity);
        if (peerId === peerUserId) {
          return entity;
        }
        if ("id" in entity && entity.id?.toString() === peerUserId) {
          return entity;
        }
      }
    } catch (e) {
      this.log.debug(
        `getDialogs while resolving peer ${peerUserId}: ${this.errorMessage(e)}`,
      );
    }

    try {
      const users = await client.invoke(
        new Api.users.GetUsers({
          id: [
            new Api.InputUser({
              userId: bigInt(peerUserId),
              accessHash: bigInt.zero,
            }),
          ],
        }),
      );
      const user = users[0];
      if (user && !(user instanceof Api.UserEmpty)) {
        return user;
      }
    } catch {
      /* not in contacts / no shared history with access_hash=0 */
    }

    throw new BadRequestException(
      "Could not resolve Telegram recipient. Open the private chat in Telegram first or receive a message from this user, then try again.",
    );
  }

  async validateSession(sessionString: string): Promise<TelegramUserProfile> {
    const client = this.createClient(sessionString);
    try {
      await client.connect();
      if (!(await client.isUserAuthorized())) {
        throw new BadRequestException("Telegram session is not authorized");
      }
      return await this.readProfile(client);
    } catch (e) {
      throw this.toHttpError(e, "Telegram session validation failed");
    } finally {
      await this.safeDisconnect(client);
    }
  }

  createConnectedClient(sessionString: string): TelegramClient {
    return this.createClient(sessionString);
  }

  private createClient(sessionString: string): TelegramClient {
    const { apiId, apiHash } = this.getCredentials();
    return new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
      connectionRetries: 3,
    });
  }

  private saveSession(client: TelegramClient): string {
    const saved = client.session.save() as string | undefined;
    if (typeof saved !== "string" || saved.length === 0) {
      throw new BadGatewayException("Telegram client did not return a session");
    }
    return saved;
  }

  private async readProfile(client: TelegramClient): Promise<TelegramUserProfile> {
    const me = await client.getMe();
    const telegramUserId = me.id?.toString() ?? "";
    const username = me.username?.trim() || null;
    const displayName =
      [me.firstName, me.lastName].filter(Boolean).join(" ").trim() ||
      username ||
      me.phone ||
      `Telegram ${telegramUserId}`;
    return { telegramUserId, username, displayName };
  }

  private isPasswordRequired(err: unknown): boolean {
    const msg = this.errorMessage(err);
    return msg === "SESSION_PASSWORD_NEEDED" || msg.includes("PASSWORD");
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === "object" && "errorMessage" in err) {
      const m = (err as { errorMessage?: unknown }).errorMessage;
      if (typeof m === "string") return m;
    }
    if (err instanceof Error) return err.message;
    return String(err);
  }

  private toHttpError(err: unknown, prefix: string): Error {
    const detail = this.errorMessage(err);
    this.log.warn(`${prefix}: ${detail}`);
    if (err instanceof BadRequestException) {
      return err;
    }
    return new BadGatewayException(`${prefix}: ${detail}`);
  }

  private async safeDisconnect(client: TelegramClient): Promise<void> {
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
  }
}
