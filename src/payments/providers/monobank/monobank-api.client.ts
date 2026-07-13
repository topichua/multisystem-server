import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createPublicKey, verify } from "node:crypto";
import { CredentialsEncryptionService } from "../../encryption/credentials-encryption.service";
import {
  MONOBANK_DEFAULT_API_BASE_URL,
  MONOBANK_INVOICE_CREATE_PATH,
  MONOBANK_INVOICE_REMOVE_PATH,
  MONOBANK_INVOICE_STATUS_PATH,
  MONOBANK_PUBKEY_PATH,
  type MonobankCreateInvoiceRequest,
  type MonobankCreateInvoiceResponse,
  type MonobankInvoicePayload,
  type MonobankPubKeyResponse,
} from "./monobank.types";
import { classifyMonobankHttpError } from "./monobank.util";

@Injectable()
export class MonobankApiClient {
  private readonly logger = new Logger(MonobankApiClient.name);
  private pubkeyCache = new Map<string, { pem: string; fetchedAt: number }>();
  private static readonly PUBKEY_CACHE_MS = 60 * 60 * 1000;

  constructor(
    private readonly config: ConfigService,
    private readonly encryption: CredentialsEncryptionService,
  ) {}

  getApiBaseUrl(): string {
    return (
      this.config.get<string>("MONOBANK_API_BASE_URL")?.trim() ||
      this.config.get<string>("MONOPAY_API_BASE_URL")?.trim() ||
      MONOBANK_DEFAULT_API_BASE_URL
    ).replace(/\/$/, "");
  }

  resolveOrderPaymentWebhookUrl(): string {
    const explicit = this.config
      .get<string>("MONOBANK_ORDER_WEBHOOK_URL")
      ?.trim();
    if (explicit) {
      return explicit;
    }
    const apiBase = this.config.get<string>("PUBLIC_API_URL")?.trim();
    if (!apiBase) {
      throw new InternalServerErrorException(
        "Set MONOBANK_ORDER_WEBHOOK_URL or PUBLIC_API_URL for order payment webhooks",
      );
    }
    return `${apiBase.replace(/\/$/, "")}/webhooks/payments/monobank`;
  }

  resolveOrderPaymentRedirectUrl(): string {
    const explicit = this.config
      .get<string>("MONOBANK_ORDER_REDIRECT_URL")
      ?.trim();
    if (explicit) {
      return explicit;
    }
    const appUrl = this.config.get<string>("APP_URL")?.trim();
    if (!appUrl) {
      throw new InternalServerErrorException(
        "Set MONOBANK_ORDER_REDIRECT_URL or APP_URL for order payment redirect",
      );
    }
    return `${appUrl.replace(/\/$/, "")}/orders/payment/result`;
  }

  getInvoiceValiditySeconds(): number {
    const raw = this.config.get<string>("MONOBANK_INVOICE_VALIDITY_SEC");
    const parsed = raw ? Number.parseInt(raw, 10) : 3600;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3600;
  }

  async validateMerchantToken(merchantToken: string): Promise<void> {
    await this.merchantRequest<MonobankPubKeyResponse>({
      token: merchantToken,
      method: "GET",
      url: `${this.getApiBaseUrl()}${MONOBANK_PUBKEY_PATH}`,
      operation: "pubkey",
    });
  }

  async createInvoice(
    merchantToken: string,
    body: MonobankCreateInvoiceRequest,
  ): Promise<MonobankCreateInvoiceResponse> {
    const parsed = await this.merchantRequest<MonobankCreateInvoiceResponse>({
      token: merchantToken,
      method: "POST",
      url: `${this.getApiBaseUrl()}${MONOBANK_INVOICE_CREATE_PATH}`,
      operation: "invoice/create",
      body,
      logContext: {
        amount: body.amount,
        reference: body.merchantPaymInfo?.reference,
      },
    });
    if (!parsed.invoiceId?.trim() || !parsed.pageUrl?.trim()) {
      throw new InternalServerErrorException(
        "Monobank response missing invoiceId or pageUrl",
      );
    }
    return parsed;
  }

  async getInvoiceStatus(
    merchantToken: string,
    invoiceId: string,
  ): Promise<MonobankInvoicePayload> {
    const url = new URL(
      `${this.getApiBaseUrl()}${MONOBANK_INVOICE_STATUS_PATH}`,
    );
    url.searchParams.set("invoiceId", invoiceId);
    return this.merchantRequest<MonobankInvoicePayload>({
      token: merchantToken,
      method: "GET",
      url: url.toString(),
      operation: "invoice/status",
      logContext: { invoiceId },
    });
  }

  async removeInvoice(merchantToken: string, invoiceId: string): Promise<void> {
    await this.merchantRequest<Record<string, never>>({
      token: merchantToken,
      method: "POST",
      url: `${this.getApiBaseUrl()}${MONOBANK_INVOICE_REMOVE_PATH}`,
      operation: "invoice/remove",
      body: { invoiceId },
      logContext: { invoiceId },
    });
  }

  async verifyWebhookSignature(
    merchantToken: string,
    rawBody: Buffer,
    xSignHeader: string | undefined,
  ): Promise<boolean> {
    if (!xSignHeader?.trim()) {
      return false;
    }
    const publicKeyPem = await this.getWebhookPublicKeyPem(merchantToken);
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
    } catch {
      return false;
    }
  }

  private async getWebhookPublicKeyPem(merchantToken: string): Promise<string> {
    const cacheKey = this.encryption.maskSecret(merchantToken);
    const cached = this.pubkeyCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.fetchedAt < MonobankApiClient.PUBKEY_CACHE_MS) {
      return cached.pem;
    }

    const parsed = await this.merchantRequest<MonobankPubKeyResponse>({
      token: merchantToken,
      method: "GET",
      url: `${this.getApiBaseUrl()}${MONOBANK_PUBKEY_PATH}`,
      operation: "pubkey",
    });
    if (!parsed.key?.trim()) {
      throw new InternalServerErrorException("Monobank public key is empty");
    }
    const pem = Buffer.from(parsed.key.trim(), "base64").toString("utf8");
    this.pubkeyCache.set(cacheKey, { pem, fetchedAt: now });
    return pem;
  }

  private async merchantRequest<T>(options: {
    token: string;
    method: "GET" | "POST";
    url: string;
    operation: string;
    body?: unknown;
    logContext?: Record<string, unknown>;
  }): Promise<T> {
    const token = options.token.trim();
    if (!token) {
      throw new BadRequestException("Merchant token is required");
    }

    this.logger.log(
      `Monobank ${options.operation}: endpoint=${options.url.replace(this.getApiBaseUrl(), "")} ` +
        `token=${this.encryption.maskSecret(token)} ` +
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
      `Monobank ${options.operation} response: http=${response.status} body=${text.slice(0, 300)}`,
    );

    if (!response.ok) {
      const { userMessage } = classifyMonobankHttpError(response.status, text);
      throw new BadRequestException(userMessage);
    }

    if (!text.trim()) {
      return {} as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new InternalServerErrorException(
        `Invalid JSON from Monobank ${options.operation}`,
      );
    }
  }
}
