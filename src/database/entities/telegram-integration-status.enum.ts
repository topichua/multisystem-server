/** Lifecycle for user-account (MTProto) Telegram connect, not Bot API. */
export enum TelegramIntegrationStatus {
  PENDING_CODE = "pending_code",
  PENDING_QR = "pending_qr",
  PENDING_PASSWORD = "pending_password",
  ACTIVE = "active",
  DISCONNECTED = "disconnected",
}
