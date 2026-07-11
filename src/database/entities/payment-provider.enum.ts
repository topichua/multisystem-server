/** Persisted as PostgreSQL enum `payment_provider_enum`. */
export enum PaymentProvider {
  monobank = "monobank",
  // Future: liqpay, wayforpay, stripe
}

export const PAYMENT_PROVIDERS = Object.values(PaymentProvider);
