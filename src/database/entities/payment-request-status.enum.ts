/** Persisted as PostgreSQL enum `payment_request_status_enum`. */
export enum PaymentRequestStatus {
  pending = "pending",
  processing = "processing",
  succeeded = "succeeded",
  failed = "failed",
  cancelled = "cancelled",
  expired = "expired",
}
