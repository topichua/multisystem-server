import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createPublicKey, verify } from "node:crypto";
import {
  MONOPAY_DEFAULT_API_BASE_URL,
  MONOPAY_INVOICE_CREATE_PATH,
  MONOPAY_INVOICE_STATUS_PATH,
  MONOPAY_PUBKEY_PATH,
  type MonopayCreateInvoiceRequest,
  type MonopayCreateInvoiceResponse,
  type MonopayInvoiceWebhookPayload,
  type MonopayPubKeyResponse,
} from "./monopay.types";
import {
  classifyMonopayHttpError,
  maskSecret,
  type MonopayAuthMode,
} from "./monopay.util";

@Injectable()
export class MonopayApiService {
  private readonly logger = new Logger(MonopayApiService.name);
  private cachedPublicKeyPem: string | null = null;
  private cachedPublicKeyFetchedAt = 0;
  private static readonly PUBKEY_CACHE_MS = 60 * 60 * 1000;

  constructor(private readonly config: ConfigService) {}

  /** Legacy Acquiring API — header `X-Token`. OAuth Checkout API is NOT implemented. */
  getAuthMode(): MonopayAuthMode {
    const hasOAuth =
      Boolean(this.config.get<string>("MONOPAY_CLIENT_ID")?.trim()) ||
      Boolean(this.config.get<string>("MONOPAY_CLIENT_SECRET")?.trim());
    if (hasOAuth) {
      this.logger.warn(
        "MONOPAY_CLIENT_ID/SECRET are set but this server uses Acquiring API (X-Token) only. OAuth Checkout is not implemented.",
      );
    }
    return "acquiring_x_token";
  }

  getIntegrationInfo() {
    return {
      api: "acquiring" as const,
      auth: "X-Token" as const,
      baseUrl: this.getApiBaseUrl(),
      createEndpoint: MONOPAY_INVOICE_CREATE_PATH,
      statusEndpoint: MONOPAY_INVOICE_STATUS_PATH,
      pubkeyEndpoint: MONOPAY_PUBKEY_PATH,
      webhookVerification: "X-Sign (ECDSA SHA-256)",
      oauthCheckoutSupported: false as const,
    };
  }

  isConfigured(): boolean {
    return Boolean(this.getToken());
  }

  /**
   * Merchant acquiring token (priority order):
   * MONOPAY_MERCHANT_TOKEN → MONOBANK_MERCHANT_TOKEN → MONOPAY_TOKEN → MONOBANK_TOKEN
   *
   * NOT valid: Personal API token from https://api.monobank.ua/index.html
   */
  getToken(): string | undefined {
    const keys = [
      "MONOPAY_MERCHANT_TOKEN",
      "MONOBANK_MERCHANT_TOKEN",
      "MONOPAY_TOKEN",
      "MONOBANK_TOKEN",
    ] as const;
    for (const key of keys) {
      const value = this.config.get<string>(key)?.trim();
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  getTokenEnvKey(): string | null {
    const keys = [
      "MONOPAY_MERCHANT_TOKEN",
      "MONOBANK_MERCHANT_TOKEN",
      "MONOPAY_TOKEN",
      "MONOBANK_TOKEN",
    ] as const;
    for (const key of keys) {
      if (this.config.get<string>(key)?.trim()) {
        return key;
      }
    }
    return null;
  }

  getApiBaseUrl(): string {
    return (
      this.config.get<string>("MONOPAY_API_BASE_URL")?.trim() ||
      MONOPAY_DEFAULT_API_BASE_URL
    ).replace(/\/$/, "");
  }

  resolveWebhookUrl(): string {
    const explicit = this.config.get<string>("MONOPAY_WEBHOOK_URL")?.trim();
    if (explicit) {
      return explicit;
    }
    const apiBase = this.config.get<string>("PUBLIC_API_URL")?.trim();
    if (!apiBase) {
      throw new ServiceUnavailableException(
        "Set MONOPAY_WEBHOOK_URL or PUBLIC_API_URL for MonoPay webhooks",
      );
    }
    return `${apiBase.replace(/\/$/, "")}/webhooks/monopay`;
  }

  resolveRedirectUrl(): string {
    const explicit = this.config.get<string>("MONOPAY_REDIRECT_URL")?.trim();
    if (explicit) {
      return explicit;
    }
    const appUrl = this.config.get<string>("APP_URL")?.trim();
    if (!appUrl) {
      throw new ServiceUnavailableException(
        "Set MONOPAY_REDIRECT_URL or APP_URL for MonoPay redirect",
      );
    }
    return `${appUrl.replace(/\/$/, "")}/billing/payment/result`;
  }

  getInvoiceValiditySeconds(): number {
    const raw = this.config.get<string>("MONOPAY_INVOICE_VALIDITY_SEC");
    const parsed = raw ? Number.parseInt(raw, 10) : 3600;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3600;
  }

  async getInvoiceStatus(
    monopayInvoiceId: string,
  ): Promise<MonopayInvoiceWebhookPayload> {
    const url = new URL(
      `${this.getApiBaseUrl()}${MONOPAY_INVOICE_STATUS_PATH}`,
    );
    url.searchParams.set("invoiceId", monopayInvoiceId);
    return this.merchantRequest<MonopayInvoiceWebhookPayload>({
      method: "GET",
      url: url.toString(),
      operation: "invoice/status",
      logContext: { monoInvoiceId: monopayInvoiceId },
    });
  }

  async createInvoice(
    body: MonopayCreateInvoiceRequest,
  ): Promise<MonopayCreateInvoiceResponse> {
    const parsed = await this.merchantRequest<MonopayCreateInvoiceResponse>({
      method: "POST",
      url: `${this.getApiBaseUrl()}${MONOPAY_INVOICE_CREATE_PATH}`,
      operation: "invoice/create",
      body,
      logContext: {
        amount: body.amount,
        reference: body.merchantPaymInfo?.reference,
      },
    });
    if (!parsed.invoiceId?.trim() || !parsed.pageUrl?.trim()) {
      throw new InternalServerErrorException(
        "MonoPay response missing invoiceId or pageUrl",
      );
    }
    return parsed;
  }

  async verifyWebhookSignature(
    rawBody: Buffer,
    xSignHeader: string | undefined,
  ): Promise<boolean> {
    if (!xSignHeader?.trim()) {
      this.logger.warn("MonoPay webhook missing X-Sign header");
      return false;
    }
    const publicKeyPem = await this.getWebhookPublicKeyPem();
    try {
      const signature = Buffer.from(xSignHeader.trim(), "base64");
      const hash = createHash("sha256").update(rawBody).digest();
      const key = createPublicKey(publicKeyPem);
      return verify(
        "sha256",
        hash,
        { key, dsaEncoding: "ieee-p1363" },
        signature,
      );
    } catch (error) {
      this.logger.warn(
        `MonoPay webhook signature verification error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private async merchantRequest<T>(options: {
    method: "GET" | "POST";
    url: string;
    operation: string;
    body?: unknown;
    logContext?: Record<string, unknown>;
  }): Promise<T> {
    const token = this.getToken();
    if (!token) {
      throw new ServiceUnavailableException(
        "Merchant token not configured. Set MONOPAY_MERCHANT_TOKEN (from web.monobank.ua acquiring). " +
          "Personal API token from api.monobank.ua does NOT work.",
      );
    }

    const tokenKey = this.getTokenEnvKey();
    this.logger.log(
      `MonoPay ${options.operation}: baseUrl=${this.getApiBaseUrl()} ` +
        `endpoint=${options.url.replace(this.getApiBaseUrl(), "")} ` +
        `auth=X-Token env=${tokenKey ?? "?"} token=${maskSecret(token)} ` +
        `${options.logContext ? `ctx=${JSON.stringify(options.logContext)}` : ""}`,
    );

    const response = await fetch(options.url, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        "X-Token": token,
      },
      ...(options.body != null ? { body: JSON.stringify(options.body) } : {}),
    });

    const text = await response.text();
    this.logger.log(
      `MonoPay ${options.operation} response: http=${response.status} ` +
        `body=${text.slice(0, 500)}`,
    );

    if (!response.ok) {
      const { kind, hint } = classifyMonopayHttpError(response.status, text);
      this.logger.error(
        `MonoPay ${options.operation} failed kind=${kind} http=${response.status} hint=${hint}`,
      );
      if (
        kind === "personal_token_rejected" ||
        kind === "invalid_merchant_token"
      ) {
        throw new BadRequestException(hint);
      }
      if (kind === "merchant_not_found") {
        throw new BadRequestException(hint);
      }
      throw new InternalServerErrorException(
        `MonoPay ${options.operation} failed (HTTP ${response.status}): ${hint}`,
      );
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new InternalServerErrorException(
        `Invalid JSON from MonoPay ${options.operation}`,
      );
    }
  }

  private async getWebhookPublicKeyPem(): Promise<string> {
    const now = Date.now();
    if (
      this.cachedPublicKeyPem &&
      now - this.cachedPublicKeyFetchedAt < MonopayApiService.PUBKEY_CACHE_MS
    ) {
      return this.cachedPublicKeyPem;
    }

    const parsed = await this.merchantRequest<MonopayPubKeyResponse>({
      method: "GET",
      url: `${this.getApiBaseUrl()}${MONOPAY_PUBKEY_PATH}`,
      operation: "pubkey",
    });

    if (!parsed.key?.trim()) {
      throw new InternalServerErrorException("MonoPay public key is empty");
    }

    this.cachedPublicKeyPem = Buffer.from(parsed.key.trim(), "base64").toString(
      "utf8",
    );
    this.cachedPublicKeyFetchedAt = now;
    return this.cachedPublicKeyPem;
  }
}
