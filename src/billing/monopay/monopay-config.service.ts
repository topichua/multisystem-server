import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MONOPAY_PUBKEY_PATH } from "./monopay.types";
import { MonopayApiService } from "./monopay-api.service";
import { classifyMonopayHttpError, maskSecret } from "./monopay.util";
import type {
  MonopayConfigCheckItemDto,
  MonopayConfigCheckResponseDto,
} from "../dto/monopay-config-check-response.dto";

@Injectable()
export class MonopayConfigService {
  constructor(
    private readonly config: ConfigService,
    private readonly monopayApi: MonopayApiService,
  ) {}

  async checkConfiguration(): Promise<MonopayConfigCheckResponseDto> {
    const checks: MonopayConfigCheckItemDto[] = [];
    const integration = this.monopayApi.getIntegrationInfo();
    const tokenEnvKey = this.monopayApi.getTokenEnvKey();
    const token = this.monopayApi.getToken();

    if (!token) {
      checks.push({
        name: "MONOPAY_MERCHANT_TOKEN",
        status: "missing",
        message:
          "Set MONOPAY_MERCHANT_TOKEN from https://web.monobank.ua/ → Інтернет → Еквайринг → Токен. " +
          "NOT the Personal API token from api.monobank.ua/index.html",
      });
    } else {
      checks.push({
        name: tokenEnvKey ?? "MONOPAY_MERCHANT_TOKEN",
        status: "ok",
        message: `Merchant token set (${maskSecret(token)})`,
      });
    }

    const oauthId = this.config.get<string>("MONOPAY_CLIENT_ID")?.trim();
    const oauthSecret = this.config.get<string>("MONOPAY_CLIENT_SECRET")?.trim();
    if (oauthId || oauthSecret) {
      checks.push({
        name: "MONOPAY_CLIENT_ID/SECRET",
        status: "warning",
        message:
          "OAuth credentials detected but this server uses Acquiring X-Token API only (not Checkout OAuth).",
      });
    }

    if (this.config.get<string>("MONOPAY_WEBHOOK_SECRET")?.trim()) {
      checks.push({
        name: "MONOPAY_WEBHOOK_SECRET",
        status: "warning",
        message:
          "Not used — webhooks are verified via X-Sign + ECDSA public key from /api/merchant/pubkey",
      });
    }

    checks.push({
      name: "API_INTEGRATION",
      status: "ok",
      message: `Acquiring API ${integration.createEndpoint} with X-Token header`,
    });

    const apiBaseUrl = this.monopayApi.getApiBaseUrl();
    checks.push({
      name: "MONOPAY_API_BASE_URL",
      status: this.config.get<string>("MONOPAY_API_BASE_URL")?.trim()
        ? "ok"
        : "warning",
      message: apiBaseUrl,
    });

    let webhookUrl: string | null = null;
    try {
      webhookUrl = this.monopayApi.resolveWebhookUrl();
      checks.push({
        name: "MONOPAY_WEBHOOK_URL",
        status: "ok",
        message: webhookUrl,
      });
    } catch {
      checks.push({
        name: "MONOPAY_WEBHOOK_URL",
        status: "missing",
        message: "Set MONOPAY_WEBHOOK_URL or PUBLIC_API_URL (must be public HTTPS)",
      });
    }

    let redirectUrl: string | null = null;
    try {
      redirectUrl = this.monopayApi.resolveRedirectUrl();
      checks.push({
        name: "MONOPAY_REDIRECT_URL",
        status: "ok",
        message: redirectUrl,
      });
    } catch {
      checks.push({
        name: "MONOPAY_REDIRECT_URL",
        status: "missing",
        message: "Set MONOPAY_REDIRECT_URL or APP_URL",
      });
    }

    const apiTest = token ? await this.testApiToken(apiBaseUrl, token) : undefined;
    if (apiTest && !apiTest.ok) {
      const tokenCheck = checks.find(
        (c) => c.name === tokenEnvKey || c.name === "MONOPAY_MERCHANT_TOKEN",
      );
      if (tokenCheck) {
        tokenCheck.status = "invalid";
        tokenCheck.message = apiTest.error ?? "MonoPay rejected the token";
      }
    }

    const envOk = checks.every(
      (c) => c.status === "ok" || c.status === "warning",
    );
    const ok = envOk && (apiTest?.ok ?? false);

    return {
      ok,
      checks,
      integration,
      tokenEnvKey,
      tokenPreview: token ? maskSecret(token) : null,
      resolved: {
        apiBaseUrl,
        webhookUrl,
        redirectUrl,
        invoiceValiditySec: this.monopayApi.getInvoiceValiditySeconds(),
      },
      apiTest,
    };
  }

  private async testApiToken(
    apiBaseUrl: string,
    token: string,
  ): Promise<NonNullable<MonopayConfigCheckResponseDto["apiTest"]>> {
    try {
      const response = await fetch(`${apiBaseUrl}${MONOPAY_PUBKEY_PATH}`, {
        headers: { "X-Token": token },
      });
      const text = await response.text();
      if (!response.ok) {
        const { hint } = classifyMonopayHttpError(response.status, text);
        return {
          ok: false,
          httpStatus: response.status,
          publicKeyFetched: false,
          error: hint,
        };
      }
      const parsed = JSON.parse(text) as { key?: string };
      const publicKeyFetched = Boolean(parsed.key?.trim());
      if (!publicKeyFetched) {
        return {
          ok: false,
          httpStatus: response.status,
          publicKeyFetched: false,
          error: "MonoPay pubkey response is empty",
        };
      }
      return {
        ok: true,
        httpStatus: response.status,
        publicKeyFetched: true,
      };
    } catch (error) {
      return {
        ok: false,
        publicKeyFetched: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
