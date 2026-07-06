/** Lifecycle for user-account (MTProto) Telegram connect, not Bot API. */
export enum TelegramIntegrationStatus {
  PENDING_CODE = "pending_code",
  PENDING_QR = "pending_qr",
  PENDING_PASSWORD = "pending_password",
  /**
   * Transient listener startup — not persisted to DB (rows stay `active`).
   * Reconcile normalizes legacy stuck `connecting` values.
   */
  CONNECTING = "connecting",
  /** Connected — session valid; listener runs when lock is held. */
  ACTIVE = "active",
  DISCONNECTED = "disconnected",
  /** Listener/session conflict or fatal Telegram error — re-login required. */
  ERROR = "error",
}
