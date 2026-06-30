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

export type TelegramQrLoginStartResult = {
  qrLoginUrl: string;
  qrToken: string;
  qrImageUrl: string;
  expiresAt: string;
  authSessionString: string;
};

export type TelegramUserProfile = {
  telegramUserId: string;
  username: string | null;
  displayName: string;
  phoneNumber: string | null;
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
  private readonly pendingQrLogins = new Map<
    string,
    {
      client: TelegramClient;
      cleanupTimer: ReturnType<typeof setTimeout>;
    }
  >();
  private static readonly QR_INVOKE_TIMEOUT_MS = 20_000;

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
    return { apiId, apiHash: apiHash };
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

  async sendLoginCode(
    phoneNumber: string,
    forceSms = false,
  ): Promise<TelegramSendCodeResult> {
    try {
      return await this.requestLoginCode(phoneNumber, forceSms);
    } catch (e) {
      if (forceSms && this.isSendCodeUnavailable(e)) {
        this.log.warn(
          `Telegram SMS login unavailable for phone=${this.maskPhone(phoneNumber)}; ` +
            "retrying with Telegram app delivery",
        );
        try {
          return await this.requestLoginCode(phoneNumber, false);
        } catch (retryErr) {
          throw this.toSendCodeUnavailableError(retryErr);
        }
      }
      if (this.isSendCodeUnavailable(e)) {
        throw this.toSendCodeUnavailableError(e);
      }
      throw this.toHttpError(e, "Failed to send Telegram login code");
    }
  }

  private async requestLoginCode(
    phoneNumber: string,
    forceSms: boolean,
  ): Promise<TelegramSendCodeResult> {
    const creds = this.getCredentials();
    const client = this.createClient("");
    try {
      await client.connect();
      const { phoneCodeHash, isCodeViaApp } = await client.sendCode(
        creds,
        phoneNumber,
        forceSms,
      );
      const authSessionString = this.saveSession(client);
      this.log.log(
        `Telegram login code requested phone=${this.maskPhone(phoneNumber)} ` +
          `delivery=${isCodeViaApp ? "telegram_app" : "sms"} forceSms=${forceSms}`,
      );
      return { phoneCodeHash, isCodeViaApp, authSessionString };
    } finally {
      await this.safeDestroyClient(client);
    }
  }

  /**
   * Exports the first Telegram QR login token (GramJS `auth.ExportLoginToken`).
   * Encode `qrLoginUrl` as a QR code for the user to scan in the Telegram app.
   */
  async startQrLogin(): Promise<TelegramQrLoginStartResult> {
    const creds = this.getCredentials();
    const client = this.createClient("");
    try {
      await client.connect();
      const result = await this.invokeWithTimeout(
        client.invoke(
          new Api.auth.ExportLoginToken({
            apiId: creds.apiId,
            apiHash: creds.apiHash,
            exceptIds: [],
          }),
        ),
        TelegramUserApiService.QR_INVOKE_TIMEOUT_MS,
        "ExportLoginToken",
      );
      if (!(result instanceof Api.auth.LoginToken)) {
        throw new BadGatewayException(
          "Unexpected Telegram QR login response from ExportLoginToken",
        );
      }

      const qrToken = result.token.toString("base64url");
      const qrLoginUrl = `tg://login?token=${qrToken}`;
      const qrImageUrl = this.buildQrImageUrl(qrLoginUrl);
      const expiresAt = new Date(result.expires * 1000).toISOString();
      const authSessionString = this.saveSession(client);

      this.registerPendingQrLogin(authSessionString, client, result.expires * 1000);

      this.log.log(
        `Telegram QR login token exported expiresAt=${expiresAt}`,
      );

      return { qrLoginUrl, qrToken, qrImageUrl, expiresAt, authSessionString };
    } catch (e) {
      await this.safeDestroyClient(client);
      throw this.toHttpError(e, "Failed to start Telegram QR login");
    }
  }

  /**
   * Waits for Telegram to confirm the QR scan, then exchanges the login token for a session.
   * Uses the live GramJS client from `startQrLogin` when still available.
   */
  async completeQrLogin(
    authSessionString: string,
    waitTimeoutMs = 90_000,
  ): Promise<
    | { kind: "active"; profile: TelegramUserProfile; sessionString: string }
    | { kind: "password_required"; authSessionString: string }
  > {
    const session = authSessionString?.trim();
    if (!session) {
      throw new BadRequestException(
        "Login session expired; start QR login again with POST /telegram-integrations/qr-login/start",
      );
    }

    const pendingClient = this.takePendingQrLogin(session);
    if (pendingClient == null) {
      this.log.warn(
        "QR confirm without live session (server restart or delay after start); token may be expired",
      );
    }
    const client = pendingClient ?? this.createClient(session);

    try {
      if (pendingClient == null) {
        await client.connect();
      }

      if (await client.isUserAuthorized()) {
        const profile = await this.readProfile(client);
        return {
          kind: "active",
          profile,
          sessionString: this.saveSession(client),
        };
      }

      const creds = this.getCredentials();
      const immediate = await this.tryFinalizeQrAfterScan(client, creds);
      if (immediate) {
        return immediate;
      }

      await this.waitForQrLoginTokenUpdate(client, waitTimeoutMs);

      const finalized = await this.tryFinalizeQrAfterScan(client, creds);
      if (finalized) {
        return finalized;
      }

      throw new BadRequestException(
        "QR login not completed yet. Scan the code in Telegram, then call POST /telegram-integrations/:id/qr-login/confirm again.",
      );
    } catch (e) {
      if (this.isQrTokenExpired(e)) {
        throw this.qrTokenExpiredException("Telegram QR login completion failed:");
      }
      throw this.toHttpError(e, "Telegram QR login completion failed");
    } finally {
      await this.safeDestroyClient(client);
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
      await this.safeDestroyClient(client);
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
      await this.safeDestroyClient(client);
    }
  }

  async getPrivateDialogs(
    sessionString: string,
    limit = 50,
    options?: {
      /** Reuse the long-lived listener client to avoid AUTH_KEY_DUPLICATED. */
      connectedClient?: TelegramClient;
    },
  ): Promise<TelegramPrivateDialogDto[]> {
    const ownsClient = options?.connectedClient == null;
    const client = options?.connectedClient ?? this.createClient(sessionString);
    try {
      if (ownsClient) {
        await client.connect();
        if (!(await client.isUserAuthorized())) {
          throw new BadRequestException("Telegram session is not authorized");
        }
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
      if (ownsClient) {
        await this.safeDestroyClient(client);
      }
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
        await this.safeDestroyClient(client);
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
      await this.safeDestroyClient(client);
    }
  }

  createConnectedClient(sessionString: string): TelegramClient {
    return this.createClient(sessionString);
  }

  /** Long-lived listener client — reconnect is handled by TelegramUpdatesListenerService sync. */
  createListenerClient(sessionString: string): TelegramClient {
    return this.createClient(sessionString, { autoReconnect: false });
  }

  async destroyClient(client: TelegramClient): Promise<void> {
    await this.safeDestroyClient(client);
  }

  private createClient(
    sessionString: string,
    options?: { autoReconnect?: boolean },
  ): TelegramClient {
    const { apiId, apiHash } = this.getCredentials();
    return new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
      connectionRetries: 10,
      retryDelay: 2000,
      autoReconnect: options?.autoReconnect ?? true,
    });
  }

  private buildQrImageUrl(qrLoginUrl: string, size = 300): string {
    const params = new URLSearchParams({
      size: `${size}x${size}`,
      data: qrLoginUrl,
    });
    return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
  }

  private maskPhone(phoneNumber: string): string {
    const digits = phoneNumber.replace(/\D/g, "");
    if (digits.length <= 4) return "***";
    return `***${digits.slice(-4)}`;
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
    const phoneRaw = me.phone?.trim();
    const phoneNumber =
      phoneRaw && phoneRaw.startsWith("+")
        ? phoneRaw
        : phoneRaw
          ? `+${phoneRaw.replace(/\D/g, "")}`
          : null;
    const displayName =
      [me.firstName, me.lastName].filter(Boolean).join(" ").trim() ||
      username ||
      phoneNumber ||
      `Telegram ${telegramUserId}`;
    return { telegramUserId, username, displayName, phoneNumber };
  }

  private registerPendingQrLogin(
    authSessionString: string,
    client: TelegramClient,
    expiresAtMs: number,
  ): void {
    void this.releasePendingQrLogin(authSessionString);

    const cleanupDelayMs = Math.max(expiresAtMs - Date.now() + 5_000, 5_000);
    const cleanupTimer = setTimeout(() => {
      void this.releasePendingQrLogin(authSessionString);
    }, cleanupDelayMs);

    this.pendingQrLogins.set(authSessionString, { client, cleanupTimer });
  }

  private takePendingQrLogin(authSessionString: string): TelegramClient | null {
    const pending = this.pendingQrLogins.get(authSessionString);
    if (!pending) {
      return null;
    }
    clearTimeout(pending.cleanupTimer);
    this.pendingQrLogins.delete(authSessionString);
    return pending.client;
  }

  private async releasePendingQrLogin(authSessionString: string): Promise<void> {
    const pending = this.pendingQrLogins.get(authSessionString);
    if (!pending) {
      return;
    }
    clearTimeout(pending.cleanupTimer);
    this.pendingQrLogins.delete(authSessionString);
    await this.safeDestroyClient(pending.client);
  }

  private waitForQrLoginTokenUpdate(
    client: TelegramClient,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        reject(
          new BadRequestException(
            "QR login timed out. Scan the code in Telegram, then call confirm again.",
          ),
        );
      }, timeoutMs);

      const handler = (update: unknown) => {
        if (settled) {
          return;
        }
        if (update instanceof Api.UpdateLoginToken) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      };

      client.addEventHandler(handler);
    });
  }

  private async tryFinalizeQrAfterScan(
    client: TelegramClient,
    creds: TelegramApiCredentials,
  ): Promise<
    | { kind: "active"; profile: TelegramUserProfile; sessionString: string }
    | { kind: "password_required"; authSessionString: string }
    | null
  > {
    let result: unknown;
    try {
      result = await this.invokeWithTimeout(
        client.invoke(
          new Api.auth.ExportLoginToken({
            apiId: creds.apiId,
            apiHash: creds.apiHash,
            exceptIds: [],
          }),
        ),
        TelegramUserApiService.QR_INVOKE_TIMEOUT_MS,
        "ExportLoginToken",
      );
    } catch (e) {
      if (this.isQrTokenExpired(e)) {
        throw this.qrTokenExpiredException("Telegram QR login completion failed:");
      }
      if (this.isPasswordRequired(e)) {
        return {
          kind: "password_required",
          authSessionString: this.saveSession(client),
        };
      }
      throw e;
    }

    if (result instanceof Api.auth.LoginToken) {
      return null;
    }

    if (
      result instanceof Api.auth.LoginTokenSuccess &&
      result.authorization instanceof Api.auth.Authorization
    ) {
      return this.buildActiveQrLoginResult(client);
    }

    if (result instanceof Api.auth.LoginTokenMigrateTo) {
      await this.invokeWithTimeout(
        client._switchDC(result.dcId),
        TelegramUserApiService.QR_INVOKE_TIMEOUT_MS,
        "switchDC",
      );

      let migratedResult: unknown;
      try {
        migratedResult = await this.invokeWithTimeout(
          client.invoke(new Api.auth.ImportLoginToken({ token: result.token })),
          TelegramUserApiService.QR_INVOKE_TIMEOUT_MS,
          "ImportLoginToken",
        );
      } catch (e) {
        if (this.isPasswordRequired(e)) {
          return {
            kind: "password_required",
            authSessionString: this.saveSession(client),
          };
        }
        throw e;
      }

      if (
        migratedResult instanceof Api.auth.LoginTokenSuccess &&
        migratedResult.authorization instanceof Api.auth.Authorization
      ) {
        return this.buildActiveQrLoginResult(client);
      }

      if (await client.isUserAuthorized()) {
        return this.buildActiveQrLoginResult(client);
      }

      throw new BadGatewayException(
        `Unexpected Telegram QR migrate response: ${
          migratedResult &&
          typeof migratedResult === "object" &&
          "className" in migratedResult
            ? String((migratedResult as { className?: unknown }).className)
            : typeof migratedResult
        }`,
      );
    }

    throw new BadGatewayException(
      `Unexpected Telegram QR login response: ${
        result && typeof result === "object" && "className" in result
          ? String((result as { className?: unknown }).className)
          : typeof result
      }`,
    );
  }

  private async buildActiveQrLoginResult(
    client: TelegramClient,
  ): Promise<{ kind: "active"; profile: TelegramUserProfile; sessionString: string }> {
    const profile = await this.readProfile(client);
    return {
      kind: "active",
      profile,
      sessionString: this.saveSession(client),
    };
  }

  private async invokeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    label: string,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new BadGatewayException(
                `${label} timed out after ${timeoutMs}ms`,
              ),
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer != null) {
        clearTimeout(timer);
      }
    }
  }

  private isPasswordRequired(err: unknown): boolean {
    const msg = this.errorMessage(err);
    return msg === "SESSION_PASSWORD_NEEDED" || msg.includes("PASSWORD");
  }

  private isSendCodeUnavailable(err: unknown): boolean {
    return this.errorMessage(err).includes("SEND_CODE_UNAVAILABLE");
  }

  private toSendCodeUnavailableError(err: unknown): BadRequestException {
    const detail = this.errorMessage(err);
    this.log.warn(`Telegram login code unavailable: ${detail}`);
    return new BadRequestException(
      "Telegram does not deliver SMS login codes to third-party apps. " +
        "Omit force_sms and read the code in the Telegram app (message from \"Telegram\" on a logged-in device). " +
        "For accounts without an active Telegram session, use QR login: POST /telegram-integrations/qr-login/start.",
    );
  }

  private isQrTokenExpired(err: unknown): boolean {
    const msg = this.errorMessage(err);
    return (
      msg === "AUTH_TOKEN_EXPIRED" ||
      msg.includes("AUTH_TOKEN_EXPIRED") ||
      msg.includes("LOGIN_TOKEN_INVALID")
    );
  }

  private qrTokenExpiredException(context: string): BadRequestException {
    return new BadRequestException(
      `${context} Telegram QR code expired (valid for about 30 seconds). ` +
        "Call POST /telegram-integrations/qr-login/start again, show the new QR, " +
        "and call POST /telegram-integrations/:id/qr-login/confirm immediately while the user scans.",
    );
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
    if (this.isQrTokenExpired(err)) {
      return this.qrTokenExpiredException(`${prefix}:`);
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

  private async safeDestroyClient(client: TelegramClient): Promise<void> {
    this.disableAutoReconnect(client);
    try {
      await client.destroy();
    } catch {
      await this.safeDisconnect(client);
    }
  }

  private disableAutoReconnect(client: TelegramClient): void {
    const mutable = client as TelegramClient & Record<string, unknown>;
    mutable._autoReconnect = false;
    const sender = mutable._sender as Record<string, unknown> | undefined;
    if (sender) {
      sender._autoReconnect = false;
      sender.userDisconnected = true;
    }
  }
}
