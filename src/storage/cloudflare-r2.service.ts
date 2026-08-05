import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";

export type R2UploadParams = {
  key: string;
  buffer: Buffer;
  contentType: string;
};

export type R2UploadResult = {
  key: string;
  publicUrl: string | null;
};

export type R2ConfigStatus = {
  configured: boolean;
  /** Credentials + bucket present (upload/delete/signed GET). */
  canUpload: boolean;
  accountIdPresent: boolean;
  accessKeyPresent: boolean;
  secretKeyPresent: boolean;
  bucketName: string | null;
  publicBaseUrl: string | null;
};

@Injectable()
export class CloudflareR2Service {
  private readonly log = new Logger(CloudflareR2Service.name);
  private readonly accountId = process.env.CF_ACCOUNT_ID?.trim();
  private readonly accessKeyId = process.env.CF_R2_ACCESS_KEY_ID?.trim();
  private readonly secretAccessKey =
    process.env.CF_R2_SECRET_ACCESS_KEY?.trim();
  private readonly bucketName = process.env.CF_R2_BUCKET_NAME?.trim();
  private readonly publicBaseUrl =
    process.env.CF_R2_PUBLIC_URL?.trim()?.replace(/\/+$/, "");

  private client: S3Client | null = null;

  isConfigured(): boolean {
    return this.getConfigStatus().configured;
  }

  /** Upload/delete/signed URL without requiring a public base URL. */
  canUpload(): boolean {
    return this.getConfigStatus().canUpload;
  }

  getConfigStatus(): R2ConfigStatus {
    const accountIdPresent = Boolean(this.accountId);
    const accessKeyPresent = Boolean(this.accessKeyId);
    const secretKeyPresent = Boolean(this.secretAccessKey);
    const bucketName = this.bucketName ?? null;
    const publicBaseUrl = this.publicBaseUrl ?? null;
    const canUpload = Boolean(
      accountIdPresent && accessKeyPresent && secretKeyPresent && bucketName,
    );
    return {
      canUpload,
      configured: Boolean(canUpload && publicBaseUrl),
      accountIdPresent,
      accessKeyPresent,
      secretKeyPresent,
      bucketName,
      publicBaseUrl,
    };
  }

  async uploadObject(params: R2UploadParams): Promise<R2UploadResult> {
    if (!this.canUpload()) {
      throw new ServiceUnavailableException(
        "Cloudflare R2 is not configured (CF_ACCOUNT_ID, CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY, CF_R2_BUCKET_NAME).",
      );
    }

    const key = params.key.replace(/^\/+/, "");
    if (!key || params.buffer.length === 0) {
      throw new ServiceUnavailableException(
        "R2 upload requires a non-empty key and buffer.",
      );
    }

    try {
      await this.getClient().send(
        new PutObjectCommand({
          Bucket: this.bucketName!,
          Key: key,
          Body: params.buffer,
          ContentType: params.contentType || "application/octet-stream",
        }),
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(`R2 upload failed key=${key}: ${err}`);
      throw new BadGatewayException(`Cloudflare R2 upload failed: ${err}`);
    }

    return {
      key,
      publicUrl: this.publicBaseUrl ? `${this.publicBaseUrl}/${key}` : null,
    };
  }

  async deleteObject(key: string): Promise<void> {
    if (!this.canUpload()) {
      return;
    }
    const normalized = key.replace(/^\/+/, "");
    if (!normalized) {
      return;
    }
    try {
      await this.getClient().send(
        new DeleteObjectCommand({
          Bucket: this.bucketName!,
          Key: normalized,
        }),
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(`R2 delete failed key=${normalized}: ${err}`);
    }
  }

  /**
   * Temporary private download URL (authorization must be checked by the caller).
   * Default 30 minutes; clamps to [60s, 1h].
   */
  async createSignedGetUrl(
    key: string,
    expiresInSeconds = 30 * 60,
  ): Promise<string> {
    if (!this.canUpload()) {
      throw new ServiceUnavailableException(
        "Cloudflare R2 is not configured for signed URLs.",
      );
    }
    const normalized = key.replace(/^\/+/, "");
    if (!normalized) {
      throw new ServiceUnavailableException("R2 signed URL requires a key.");
    }
    const expires = Math.min(Math.max(expiresInSeconds, 60), 60 * 60);
    try {
      return await getSignedUrl(
        this.getClient(),
        new GetObjectCommand({
          Bucket: this.bucketName!,
          Key: normalized,
        }),
        { expiresIn: expires },
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(`R2 signed URL failed key=${normalized}: ${err}`);
      throw new BadGatewayException(`Cloudflare R2 signed URL failed: ${err}`);
    }
  }

  buildPublicUrl(key: string): string {
    const normalized = key.replace(/^\/+/, "");
    return `${this.publicBaseUrl}/${normalized}`;
  }

  private getClient(): S3Client {
    if (this.client) {
      return this.client;
    }
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.accessKeyId!,
        secretAccessKey: this.secretAccessKey!,
      },
    });
    return this.client;
  }
}
