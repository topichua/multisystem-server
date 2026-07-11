import type { PaymentProvider } from "../../database/entities/payment-provider.enum";
import type { PaymentRequestStatus } from "../../database/entities/payment-request-status.enum";

export type MonobankCredentials = {
  merchantToken: string;
};

export type PaymentProviderCredentials =
  | { provider: PaymentProvider.monobank; data: MonobankCredentials };

export type CreatePaymentLinkInput = {
  amount: number;
  currency: string;
  reference: string;
  description: string;
  redirectUrl: string;
  webhookUrl: string;
  validitySeconds?: number;
};

export type CreatePaymentLinkResult = {
  externalPaymentId: string;
  paymentUrl: string;
  expiresAt: Date | null;
  providerStatus: string;
};

export type ProviderPaymentStatusResult = {
  externalPaymentId: string;
  providerStatus: string;
  localStatus: PaymentRequestStatus;
  amount: number;
  currency: string;
  paidAt: Date | null;
  failureReason: string | null;
  providerModifiedAt: Date | null;
};

export type ParsedWebhookEvent = {
  externalPaymentId: string;
  providerStatus: string;
  localStatus: PaymentRequestStatus;
  amount: number;
  currency: string;
  paidAt: Date | null;
  failureReason: string | null;
  externalTransactionId: string | null;
  providerModifiedAt: Date | null;
};

export type ValidateCredentialsResult = {
  valid: boolean;
  userMessage?: string;
};

export interface PaymentProviderAdapter {
  readonly provider: PaymentProvider;

  validateCredentials(): Promise<ValidateCredentialsResult>;

  createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult>;

  getPaymentStatus(externalPaymentId: string): Promise<ProviderPaymentStatusResult>;

  cancelPayment(externalPaymentId: string): Promise<{ providerStatus: string }>;

  refundPayment(
    externalPaymentId: string,
    amount?: number,
  ): Promise<{ providerStatus: string }>;

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | undefined>): Promise<boolean>;

  parseWebhook(rawBody: Buffer): ParsedWebhookEvent;
}
