import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

@Injectable()
export class CredentialsEncryptionService implements OnModuleInit {
  private key: Buffer | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.key = this.resolveKey();
  }

  encrypt(plaintext: string): string {
    const key = this.requireKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString("base64"),
      authTag.toString("base64"),
      encrypted.toString("base64"),
    ].join(":");
  }

  decrypt(payload: string): string {
    const key = this.requireKey();
    const parts = payload.split(":");
    if (parts.length !== 3) {
      throw new InternalServerErrorException(
        "Invalid encrypted credentials format",
      );
    }
    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(tagB64, "base64");
    const encrypted = Buffer.from(dataB64, "base64");
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new InternalServerErrorException(
        "Failed to decrypt payment credentials. " +
          "PAYMENT_CREDENTIALS_ENCRYPTION_KEY (or JWT_SECRET fallback) " +
          "does not match the key used when the integration was connected. " +
          "Reconnect the Monobank integration on this environment, " +
          "or restore the original encryption key.",
      );
    }
  }

  maskSecret(value: string | undefined | null): string {
    if (!value?.trim()) {
      return "****";
    }
    const v = value.trim();
    if (v.length <= 8) {
      return "****";
    }
    return `${v.slice(0, 4)}…${v.slice(-4)}`;
  }

  private requireKey(): Buffer {
    if (!this.key) {
      this.key = this.resolveKey();
    }
    return this.key;
  }

  private resolveKey(): Buffer {
    const raw =
      this.config.get<string>("PAYMENT_CREDENTIALS_ENCRYPTION_KEY")?.trim() ||
      this.config.get<string>("CREDENTIALS_ENCRYPTION_KEY")?.trim() ||
      this.config.get<string>("JWT_SECRET")?.trim();
    if (!raw) {
      throw new InternalServerErrorException(
        "PAYMENT_CREDENTIALS_ENCRYPTION_KEY (or JWT_SECRET fallback) is not configured",
      );
    }
    return createHash("sha256").update(raw).digest();
  }
}
