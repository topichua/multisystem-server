import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThan, Repository } from "typeorm";
import {
  WorkspaceExportJob,
  type WorkspaceExportFormat,
  type WorkspaceExportType,
} from "../database/entities/workspace-export-job.entity";
import { CloudflareR2Service } from "../storage/cloudflare-r2.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import {
  CreateWorkspaceExportResponseDto,
  WorkspaceExportStatusResponseDto,
} from "./dto/workspace-export-response.dto";
import {
  buildExportFileName,
  buildExportObjectKey,
  newExportId,
} from "./export-file.util";

const SAFE_FAIL_MESSAGE = "Не вдалося сформувати файл експорту";
const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_SIGNED_URL_SECONDS = 30 * 60;

export type CreateWorkspaceExportJobParams = {
  workspaceId: number;
  requestedById: number;
  type: WorkspaceExportType;
  mode?: string | null;
  format: WorkspaceExportFormat;
  filters?: Record<string, unknown> | null;
  options?: Record<string, unknown> | null;
};

@Injectable()
export class WorkspaceExportsService {
  private readonly log = new Logger(WorkspaceExportsService.name);

  constructor(
    @InjectRepository(WorkspaceExportJob)
    private readonly jobRepo: Repository<WorkspaceExportJob>,
    private readonly r2: CloudflareR2Service,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly config: ConfigService,
  ) {}

  getRetentionDays(): number {
    const raw = this.config.get<string>("EXPORT_RETENTION_DAYS");
    const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETENTION_DAYS;
  }

  getSignedUrlTtlSeconds(): number {
    const raw = this.config.get<string>("EXPORT_SIGNED_URL_SECONDS");
    const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(n) && n > 0
      ? Math.min(Math.max(n, 60), 60 * 60)
      : DEFAULT_SIGNED_URL_SECONDS;
  }

  async createJob(
    params: CreateWorkspaceExportJobParams,
  ): Promise<CreateWorkspaceExportResponseDto> {
    const id = newExportId();
    const row = this.jobRepo.create({
      id,
      workspaceId: params.workspaceId,
      requestedById: params.requestedById,
      type: params.type,
      mode: params.mode ?? null,
      format: params.format,
      filters: params.filters ?? null,
      options: params.options ?? null,
      status: "pending",
      progress: 0,
      fileKey: null,
      fileName: null,
      fileSize: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      expiresAt: null,
    });
    await this.jobRepo.save(row);
    // Spec: immediate response uses "processing" as client-facing lifecycle start.
    return { exportId: row.id, status: "processing" };
  }

  async getStatusForOwner(
    ownerId: number,
    exportId: string,
  ): Promise<WorkspaceExportStatusResponseDto> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const row = await this.requireInWorkspace(workspace.id, exportId);
    return this.toStatusDto(row, { includeDownloadUrl: true });
  }

  async getDownloadForOwner(
    ownerId: number,
    exportId: string,
  ): Promise<{
    downloadUrl: string;
    fileName: string;
    expiresInSeconds: number;
  }> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);
    const row = await this.requireInWorkspace(workspace.id, exportId);
    if (row.status !== "completed" || !row.fileKey || !row.fileName) {
      throw new BadRequestException("Export is not ready for download");
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException("Export file has expired");
    }
    const expiresInSeconds = this.getSignedUrlTtlSeconds();
    const downloadUrl = await this.r2.createSignedGetUrl(
      row.fileKey,
      expiresInSeconds,
    );
    return {
      downloadUrl,
      fileName: row.fileName,
      expiresInSeconds,
    };
  }

  async claimNextForProcessing(): Promise<WorkspaceExportJob | null> {
    return this.jobRepo.manager.transaction(async (em) => {
      const repo = em.getRepository(WorkspaceExportJob);
      const row = await repo
        .createQueryBuilder("e")
        .where("e.status = :pending", { pending: "pending" })
        .orderBy("e.created_at", "ASC")
        .limit(1)
        .setLock("pessimistic_write")
        .setOnLocked("skip_locked")
        .getOne();
      if (!row) {
        return null;
      }
      row.status = "processing";
      row.startedAt = row.startedAt ?? new Date();
      row.progress = Math.max(row.progress ?? 0, 1);
      row.errorMessage = null;
      return repo.save(row);
    });
  }

  async updateProgress(id: string, progress: number): Promise<void> {
    const p = Math.min(100, Math.max(0, Math.round(progress)));
    await this.jobRepo.update(id, { progress: p });
  }

  async markFailed(id: string, message?: string): Promise<void> {
    await this.jobRepo.update(id, {
      status: "failed",
      progress: 100,
      completedAt: new Date(),
      errorMessage: (message ?? SAFE_FAIL_MESSAGE).slice(0, 2000),
    });
  }

  async markCompleted(
    job: WorkspaceExportJob,
    params: {
      buffer: Buffer;
      contentType: string;
      fileName: string;
    },
  ): Promise<void> {
    if (!this.r2.canUpload()) {
      throw new ServiceUnavailableException(
        "Cloudflare R2 is not configured for exports",
      );
    }
    const fileKey = buildExportObjectKey(
      job.type,
      job.workspaceId,
      job.id,
      params.fileName,
    );
    await this.r2.uploadObject({
      key: fileKey,
      buffer: params.buffer,
      contentType: params.contentType,
    });
    const completedAt = new Date();
    const expiresAt = new Date(
      completedAt.getTime() + this.getRetentionDays() * 24 * 60 * 60 * 1000,
    );
    await this.jobRepo.update(job.id, {
      status: "completed",
      progress: 100,
      fileKey,
      fileName: params.fileName,
      fileSize: params.buffer.length,
      completedAt,
      expiresAt,
      errorMessage: null,
    });
  }

  async cleanupExpiredExports(): Promise<number> {
    const now = new Date();
    const rows = await this.jobRepo.find({
      where: {
        status: "completed",
        expiresAt: LessThan(now),
      },
      take: 50,
      order: { expiresAt: "ASC" },
    });
    let cleaned = 0;
    for (const row of rows) {
      if (row.fileKey) {
        await this.r2.deleteObject(row.fileKey);
      }
      await this.jobRepo.update(row.id, {
        status: "expired",
        fileKey: null,
      });
      cleaned += 1;
    }
    return cleaned;
  }

  async getJobById(id: string): Promise<WorkspaceExportJob | null> {
    return this.jobRepo.findOne({ where: { id } });
  }

  async ensureIdempotentSkip(job: WorkspaceExportJob): Promise<boolean> {
    const fresh = await this.jobRepo.findOne({ where: { id: job.id } });
    if (!fresh) return true;
    if (fresh.status === "completed" && fresh.fileKey) return true;
    if (fresh.status === "expired" || fresh.status === "failed") return true;
    if (fresh.status !== "processing") return true;
    return false;
  }

  makeFileName(prefix: string, format: WorkspaceExportFormat, at?: Date): string {
    return buildExportFileName(prefix, format, at);
  }

  private async requireInWorkspace(
    workspaceId: number,
    exportId: string,
  ): Promise<WorkspaceExportJob> {
    const row = await this.jobRepo.findOne({
      where: { id: exportId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Export not found");
    }
    return row;
  }

  private async toStatusDto(
    row: WorkspaceExportJob,
    options: { includeDownloadUrl: boolean },
  ): Promise<WorkspaceExportStatusResponseDto> {
    // Present pending as processing for clients that poll immediately after create.
    const status =
      row.status === "pending" ? "processing" : row.status;

    const base: WorkspaceExportStatusResponseDto = {
      exportId: row.id,
      status,
      progress: row.status === "pending" ? 0 : row.progress ?? 0,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      expiresAt: row.expiresAt,
      downloadUrl: null,
    };

    if (row.status === "failed") {
      return {
        ...base,
        status: "failed",
        errorMessage: row.errorMessage ?? SAFE_FAIL_MESSAGE,
        progress: 100,
      };
    }

    if (row.status === "completed") {
      base.fileName = row.fileName;
      base.fileSize = row.fileSize != null ? Number(row.fileSize) : null;
      base.progress = 100;
      if (
        options.includeDownloadUrl &&
        row.fileKey &&
        (!row.expiresAt || row.expiresAt.getTime() > Date.now())
      ) {
        try {
          base.downloadUrl = await this.r2.createSignedGetUrl(
            row.fileKey,
            this.getSignedUrlTtlSeconds(),
          );
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          this.log.warn(`Signed URL failed exportId=${row.id}: ${err}`);
          base.downloadUrl = null;
        }
      }
    }

    return base;
  }
}
