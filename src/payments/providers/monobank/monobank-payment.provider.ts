import { BadRequestException } from "@nestjs/common";
import { PaymentProvider } from "../../../database/entities/payment-provider.enum";
import { PaymentRequestStatus } from "../../../database/entities/payment-request-status.enum";
import type {
  CreatePaymentLinkInput,
  CreatePaymentLinkResult,
  MonobankCredentials,
  ParsedWebhookEvent,
  PaymentProviderAdapter,
  ProviderPaymentStatusResult,
  ValidateCredentialsResult,
} from "../payment-provider.types";
import { MonobankApiClient } from "./monobank-api.client";
import {
  currencyToMonobankCcy,
  majorAmountToMonobankKop,
  mapMonobankStatusToPaymentRequestStatus,
  monobankAmountToMajor,
} from "./monobank.status-mapper";
import type { MonobankInvoicePayload } from "./monobank.types";

export class MonobankPaymentProvider implements PaymentProviderAdapter {
  readonly provider = PaymentProvider.monobank;

  constructor(
    private readonly credentials: MonobankCredentials,
    private readonly api: MonobankApiClient,
  ) {}

  async validateCredentials(): Promise<ValidateCredentialsResult> {
    try {
      await this.api.validateMerchantToken(this.credentials.merchantToken);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        userMessage:
          error instanceof BadRequestException
            ? (error.message as string)
            : "Не вдалося підключити Monobank. Перевірте merchant token.",
      };
    }
  }

  async createPaymentLink(
    input: CreatePaymentLinkInput,
  ): Promise<CreatePaymentLinkResult> {
    if (input.currency.toUpperCase() !== "UAH") {
      throw new BadRequestException("Monobank підтримує лише UAH");
    }
    const amountKop = majorAmountToMonobankKop(input.amount);
    if (amountKop <= 0) {
      throw new BadRequestException("Сума має бути більше нуля");
    }

    const validity = input.validitySeconds ?? this.api.getInvoiceValiditySeconds();
    const response = await this.api.createInvoice(this.credentials.merchantToken, {
      amount: amountKop,
      ccy: currencyToMonobankCcy(input.currency),
      merchantPaymInfo: {
        reference: input.reference,
        destination: input.description,
        comment: input.description,
      },
      redirectUrl: input.redirectUrl,
      webHookUrl: input.webhookUrl,
      validity,
      paymentType: "debit",
    });

    const expiresAt = new Date(Date.now() + validity * 1000);
    return {
      externalPaymentId: response.invoiceId,
      paymentUrl: response.pageUrl,
      expiresAt,
      providerStatus: "created",
    };
  }

  async getPaymentStatus(
    externalPaymentId: string,
  ): Promise<ProviderPaymentStatusResult> {
    const payload = await this.api.getInvoiceStatus(
      this.credentials.merchantToken,
      externalPaymentId,
    );
    return this.mapPayload(payload);
  }

  async cancelPayment(
    externalPaymentId: string,
  ): Promise<{ providerStatus: string }> {
    await this.api.removeInvoice(
      this.credentials.merchantToken,
      externalPaymentId,
    );
    return { providerStatus: "removed" };
  }

  async refundPayment(
    _externalPaymentId: string,
    _amount?: number,
  ): Promise<{ providerStatus: string }> {
    throw new BadRequestException(
      "Автоматичне повернення через Monobank ще не реалізовано",
    );
  }

  async verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): Promise<boolean> {
    return this.api.verifyWebhookSignature(
      this.credentials.merchantToken,
      rawBody,
      headers["x-sign"] ?? headers["X-Sign"],
    );
  }

  parseWebhook(rawBody: Buffer): ParsedWebhookEvent {
    const payload = JSON.parse(rawBody.toString("utf8")) as MonobankInvoicePayload;
    const mapped = this.mapPayload(payload);
    return {
      ...mapped,
      externalTransactionId:
        mapped.localStatus === PaymentRequestStatus.succeeded && payload.invoiceId
          ? `${payload.invoiceId}:success`
          : null,
    };
  }

  private mapPayload(payload: MonobankInvoicePayload): ProviderPaymentStatusResult {
    const localStatus = mapMonobankStatusToPaymentRequestStatus(payload.status);
    const amountMajor = monobankAmountToMajor(
      payload.finalAmount ?? payload.amount,
    );
    const modifiedAt = payload.modifiedDate
      ? new Date(payload.modifiedDate)
      : null;
    return {
      externalPaymentId: payload.invoiceId,
      providerStatus: payload.status,
      localStatus,
      amount: amountMajor,
      currency: payload.ccy === 980 ? "UAH" : String(payload.ccy),
      paidAt: localStatus === PaymentRequestStatus.succeeded ? modifiedAt : null,
      failureReason: payload.failureReason ?? null,
      providerModifiedAt: modifiedAt,
    };
  }
}
