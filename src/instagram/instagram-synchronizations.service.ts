import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  InstagramIntegration,
  InstagramSynchronization,
} from "../database/entities";
import type {
  InstagramSynchronizationPhase,
  InstagramSynchronizationStatus,
} from "../database/entities/instagram-synchronization-status";
import type { InstagramSynchronizationDto } from "./dto/instagram-synchronization.dto";

const DEFAULT_WINDOW_DAYS = 7;
const ACTIVE_STATUSES: InstagramSynchronizationStatus[] = [
  "pending",
  "processing",
];

@Injectable()
export class InstagramSynchronizationsService {
  constructor(
    @InjectRepository(InstagramSynchronization)
    private readonly syncRepo: Repository<InstagramSynchronization>,
  ) {}

  /**
   * Enqueue a 7-day conversations+messages backfill after Instagram connect.
   * If a pending/processing job already exists for the integration, returns it.
   */
  async enqueueAfterConnect(
    integration: InstagramIntegration,
    windowDays = DEFAULT_WINDOW_DAYS,
  ): Promise<InstagramSynchronization> {
    const existing = await this.syncRepo.findOne({
      where: {
        integrationId: integration.id,
        status: In(ACTIVE_STATUSES),
      },
      order: { id: "DESC" },
    });
    if (existing) {
      return existing;
    }

    const days =
      Number.isFinite(windowDays) && windowDays > 0
        ? Math.floor(windowDays)
        : DEFAULT_WINDOW_DAYS;
    const sinceAt = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return this.syncRepo.save(
      this.syncRepo.create({
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        status: "pending",
        phase: "conversations",
        sinceAt,
        windowDays: days,
        conversationsTotal: 0,
        conversationsProcessed: 0,
        conversationsFailed: 0,
        messagesImported: 0,
        error: null,
        startedAt: null,
        finishedAt: null,
      }),
    );
  }

  async claimNextForProcessing(): Promise<InstagramSynchronization | null> {
    return this.syncRepo.manager.transaction(async (em) => {
      const repo = em.getRepository(InstagramSynchronization);
      const row = await repo
        .createQueryBuilder("s")
        .where("s.status = :pending", {
          pending: "pending" satisfies InstagramSynchronizationStatus,
        })
        .orderBy("s.created_at", "ASC")
        .limit(1)
        .setLock("pessimistic_write")
        .setOnLocked("skip_locked")
        .getOne();

      if (!row) {
        return null;
      }

      row.status = "processing";
      row.startedAt = row.startedAt ?? new Date();
      row.error = null;
      return repo.save(row);
    });
  }

  async updateProgress(
    id: number,
    patch: Partial<{
      phase: InstagramSynchronizationPhase;
      conversationsTotal: number;
      conversationsProcessed: number;
      conversationsFailed: number;
      messagesImported: number;
      error: string | null;
    }>,
  ): Promise<void> {
    await this.syncRepo.update(id, patch);
  }

  async markCompleted(id: number): Promise<void> {
    await this.syncRepo.update(id, {
      status: "completed",
      phase: "done",
      finishedAt: new Date(),
      error: null,
    });
  }

  async markFailed(id: number, error: string): Promise<void> {
    await this.syncRepo.update(id, {
      status: "failed",
      finishedAt: new Date(),
      error: error.slice(0, 4000),
    });
  }

  async listForWorkspace(
    workspaceId: number,
    integrationId?: number,
  ): Promise<InstagramSynchronizationDto[]> {
    const rows = await this.syncRepo.find({
      where:
        integrationId != null
          ? { workspaceId, integrationId }
          : { workspaceId },
      order: { id: "DESC" },
      take: 50,
    });
    return rows.map((row) => this.toDto(row));
  }

  async getByIdForWorkspace(
    workspaceId: number,
    id: number,
  ): Promise<InstagramSynchronizationDto> {
    const row = await this.syncRepo.findOne({ where: { id, workspaceId } });
    if (!row) {
      throw new NotFoundException("Instagram synchronization not found");
    }
    return this.toDto(row);
  }

  toDto(row: InstagramSynchronization): InstagramSynchronizationDto {
    const total = row.conversationsTotal;
    const processed = row.conversationsProcessed;
    const progressPercent =
      total > 0
        ? Math.min(100, Math.round((processed / total) * 100))
        : row.status === "completed"
          ? 100
          : row.status === "pending"
            ? 0
            : null;

    return {
      id: row.id,
      workspaceId: row.workspaceId,
      integrationId: row.integrationId,
      status: row.status,
      phase: row.phase,
      sinceAt: row.sinceAt,
      windowDays: row.windowDays,
      conversationsTotal: row.conversationsTotal,
      conversationsProcessed: row.conversationsProcessed,
      conversationsFailed: row.conversationsFailed,
      messagesImported: row.messagesImported,
      progressPercent,
      error: row.error,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
