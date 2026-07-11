import { BadRequestException } from "@nestjs/common";
import { ManualPaymentMethodType } from "../../database/entities/manual-payment-method-type.enum";

export function normalizeManualPaymentMethodValue(
  type: ManualPaymentMethodType,
  raw: string,
): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new BadRequestException("value is required");
  }

  if (type === ManualPaymentMethodType.iban) {
    const normalized = trimmed.replace(/\s+/g, "").toUpperCase();
    if (!/^UA\d{27}$/.test(normalized)) {
      throw new BadRequestException(
        "IBAN must be a valid Ukrainian IBAN (UA + 27 digits)",
      );
    }
    return normalized;
  }

  const digits = trimmed.replace(/\s+/g, "");
  if (!/^\d{13,19}$/.test(digits)) {
    throw new BadRequestException("Card number must contain 13–19 digits");
  }
  return digits;
}

export function formatManualPaymentMethodValueForDisplay(
  type: ManualPaymentMethodType,
  value: string,
): string {
  if (type === ManualPaymentMethodType.iban) {
    return value.replace(/(.{4})/g, "$1 ").trim();
  }
  return value.replace(/(\d{4})/g, "$1 ").trim();
}
