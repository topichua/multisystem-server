export type ManualPaymentKind = "cash" | "transfer";

export function resolveManualPaymentKind(
  manualPaymentMethodId: number | null | undefined,
): ManualPaymentKind {
  return manualPaymentMethodId != null ? "transfer" : "cash";
}

export const MANUAL_PAYMENT_KIND_CASH: ManualPaymentKind = "cash";
export const MANUAL_PAYMENT_KIND_TRANSFER: ManualPaymentKind = "transfer";
