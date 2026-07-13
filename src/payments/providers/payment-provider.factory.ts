import { BadRequestException, Injectable } from "@nestjs/common";
import { PaymentProvider } from "../../database/entities/payment-provider.enum";
import { CredentialsEncryptionService } from "../encryption/credentials-encryption.service";
import { MonobankApiClient } from "./monobank/monobank-api.client";
import { MonobankPaymentProvider } from "./monobank/monobank-payment.provider";
import type {
  MonobankCredentials,
  PaymentProviderAdapter,
  PaymentProviderCredentials,
} from "./payment-provider.types";

@Injectable()
export class PaymentProviderFactory {
  constructor(
    private readonly encryption: CredentialsEncryptionService,
    private readonly monobankApi: MonobankApiClient,
  ) {}

  getProvider(credentials: PaymentProviderCredentials): PaymentProviderAdapter {
    switch (credentials.provider) {
      case PaymentProvider.monobank:
        return new MonobankPaymentProvider(credentials.data, this.monobankApi);
      default:
        throw new BadRequestException(
          `Payment provider "${String(credentials.provider)}" is not supported`,
        );
    }
  }

  decryptCredentials(
    provider: PaymentProvider,
    credentialsEncrypted: string,
  ): PaymentProviderCredentials {
    const json = this.encryption.decrypt(credentialsEncrypted);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    switch (provider) {
      case PaymentProvider.monobank: {
        const merchantToken =
          typeof parsed.merchantToken === "string"
            ? parsed.merchantToken.trim()
            : "";
        if (!merchantToken) {
          throw new BadRequestException(
            "Stored Monobank credentials are invalid",
          );
        }
        return {
          provider: PaymentProvider.monobank,
          data: { merchantToken } satisfies MonobankCredentials,
        };
      }
      default:
        throw new BadRequestException(
          `Payment provider "${provider}" credentials cannot be decrypted`,
        );
    }
  }

  encryptMonobankCredentials(merchantToken: string): string {
    const payload = JSON.stringify({
      merchantToken: merchantToken.trim(),
    } satisfies MonobankCredentials);
    return this.encryption.encrypt(payload);
  }

  maskCredentials(
    provider: PaymentProvider,
    credentialsEncrypted: string | null,
  ): string | null {
    if (!credentialsEncrypted) {
      return null;
    }
    try {
      const creds = this.decryptCredentials(provider, credentialsEncrypted);
      if (creds.provider === PaymentProvider.monobank) {
        return this.encryption.maskSecret(creds.data.merchantToken);
      }
      return "****";
    } catch {
      return "****";
    }
  }
}
