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
  if (paidAmount <= 0) {
    return options?.hasSucceededRefunds
      ? OrderPaymentStatus.refunded
      : OrderPaymentStatus.unpaid;
  }
  if (paidAmount > totalAmount) {
    return OrderPaymentStatus.overpaid;
  }
  if (paidAmount >= totalAmount) {
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

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
