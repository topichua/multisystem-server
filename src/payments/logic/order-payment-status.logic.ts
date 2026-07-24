import { OrderPaymentStatus } from "../../database/entities/order-payment-status.enum";
import { PaymentTransactionStatus } from "../../database/entities/payment-transaction-status.enum";
import { PaymentTransactionType } from "../../database/entities/payment-transaction-type.enum";

export type PaymentTransactionAmountRow = {
  type: PaymentTransactionType;
  status: PaymentTransactionStatus;
  amount: number;
};

export function calculatePaidAmount(
  transactions: PaymentTransactionAmountRow[],
): number {
  let paid = 0;
  for (const row of transactions) {
    if (row.status !== PaymentTransactionStatus.succeeded) {
      continue;
    }
    if (row.type === PaymentTransactionType.charge) {
      paid += row.amount;
    } else if (row.type === PaymentTransactionType.refund) {
      paid -= row.amount;
    } else if (row.type === PaymentTransactionType.adjustment) {
      paid += row.amount;
    }
  }
  return roundMoney(paid);
}

export function calculateOrderPaymentStatus(
  totalAmount: number,
  paidAmount: number,
  options?: { hasSucceededRefunds?: boolean },
): OrderPaymentStatus {
  const total = roundMoney(Number(totalAmount) || 0);
  const paid = roundMoney(Number(paidAmount) || 0);

  if (paid <= 0) {
    return options?.hasSucceededRefunds
      ? OrderPaymentStatus.refunded
      : OrderPaymentStatus.unpaid;
  }
  if (paid > total) {
    return OrderPaymentStatus.overpaid;
  }
  if (paid >= total) {
    return OrderPaymentStatus.paid;
  }
  return OrderPaymentStatus.partial;
}

export function calculateRemainingAmount(
  totalAmount: number,
  paidAmount: number,
): number {
  return roundMoney(Math.max(0, totalAmount - paidAmount));
}

/** Sum of pending charge amounts (reserved but not yet counted as paid). */
export function calculatePendingChargeAmount(
  transactions: PaymentTransactionAmountRow[],
): number {
  let pending = 0;
  for (const row of transactions) {
    if (
      row.status === PaymentTransactionStatus.pending &&
      row.type === PaymentTransactionType.charge
    ) {
      pending += row.amount;
    }
  }
  return roundMoney(pending);
}

export function hasPendingCharge(
  transactions: PaymentTransactionAmountRow[],
): boolean {
  return calculatePendingChargeAmount(transactions) > 0;
}

/** True when order is not fully paid and there is no pending charge. */
export function canCreateOrderPayment(
  paymentStatus: OrderPaymentStatus,
  transactions: PaymentTransactionAmountRow[],
): boolean {
  if (
    paymentStatus === OrderPaymentStatus.paid ||
    paymentStatus === OrderPaymentStatus.overpaid
  ) {
    return false;
  }
  return !hasPendingCharge(transactions);
}

/** True when there is succeeded paid amount that can be refunded. */
export function canRefundOrderPayment(
  transactions: PaymentTransactionAmountRow[],
): boolean {
  return calculatePaidAmount(transactions) > 0;
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
