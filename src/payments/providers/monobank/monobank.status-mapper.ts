import { PaymentRequestStatus } from "../../../database/entities/payment-request-status.enum";
import type { MonobankInvoiceStatus } from "./monobank.types";

export function mapMonobankStatusToPaymentRequestStatus(
  status: MonobankInvoiceStatus,
): PaymentRequestStatus {
  switch (status) {
    case "created":
      return PaymentRequestStatus.pending;
    case "processing":
    case "hold":
      return PaymentRequestStatus.processing;
    case "success":
      return PaymentRequestStatus.succeeded;
    case "failure":
      return PaymentRequestStatus.failed;
    case "reversed":
      return PaymentRequestStatus.cancelled;
    case "expired":
      return PaymentRequestStatus.expired;
    default:
      return PaymentRequestStatus.processing;
  }
}

export function isMonobankTerminalStatus(
  status: MonobankInvoiceStatus,
): boolean {
  return (
    status === "success" ||
    status === "failure" ||
    status === "reversed" ||
    status === "expired"
  );
}

export function canMonobankCancelPaymentLink(
  status: PaymentRequestStatus,
): boolean {
  return (
    status === PaymentRequestStatus.pending ||
    status === PaymentRequestStatus.processing
  );
}

export function monobankAmountToMajor(amountKop: number): number {
  return Math.round(amountKop) / 100;
}

export function majorAmountToMonobankKop(amount: number): number {
  return Math.round(amount * 100);
}

export function currencyToMonobankCcy(currency: string): number {
  if (currency.toUpperCase() === "UAH") {
    return 980;
  }
  throw new Error(`Unsupported currency for Monobank: ${currency}`);
}
