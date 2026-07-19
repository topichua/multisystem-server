/** Persisted as PostgreSQL enum `payment_transaction_source_enum`. */
export enum PaymentTransactionSource {
  provider_webhook = "provider_webhook",
  manual = "manual",
  online_payment = "online_payment",
  delivery = "delivery",
  system = "system",
}
