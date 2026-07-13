import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import {
  CloudflareR2Service,
  type R2ConfigStatus,
} from "./cloudflare-r2.service";
import type {
  R2PingResponseDto,
  R2UploadTestResponseDto,
} from "./dto/r2-storage-response.dto";

type UploadedFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
};

@Injectable()
export class StorageService {
  constructor(private readonly r2: CloudflareR2Service) {}

  getR2ConfigStatus(): R2ConfigStatus {
    return this.r2.getConfigStatus();
  }

  async uploadR2TestFile(file: UploadedFile): Promise<R2UploadTestResponseDto> {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Multipart field `file` is required.");
    }

    const originalName = this.sanitizeFilename(
      file.originalname ?? "upload.bin",
    );
    const contentType = file.mimetype?.trim() || "application/octet-stream";
    const key = `upload-tests/${randomUUID()}/${originalName}`;

    const uploaded = await this.r2.uploadObject({
      key,
      buffer: file.buffer,
      contentType,
    });

    return {
      key: uploaded.key,
      publicUrl: uploaded.publicUrl,
      contentType,
      sizeBytes: file.buffer.length,
      originalName,
    };
  }

  async pingR2(): Promise<R2PingResponseDto> {
    const pingAt = new Date().toISOString();
    const key = `upload-tests/ping-${randomUUID()}.json`;
    const body = Buffer.from(
      JSON.stringify({ ok: true, pingAt, service: "multisystem-server" }),
      "utf8",
    );

    const uploaded = await this.r2.uploadObject({
      key,
      buffer: body,
      contentType: "application/json",
    });

    return {
      ok: true,
      key: uploaded.key,
      publicUrl: uploaded.publicUrl,
      pingAt,
    };
  }

  private sanitizeFilename(name: string): string {
    const base = name.split(/[/\\]/).pop()?.trim() || "upload.bin";
    const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_");
    return safe.length > 0 ? safe.slice(0, 180) : "upload.bin";
  }
}
