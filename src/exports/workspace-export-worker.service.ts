import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ExportHandlerRegistry } from "./export-handler-registry";
import { WorkspaceExportsService } from "./workspace-exports.service";

@Injectable()
export class WorkspaceExportWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly log = new Logger(WorkspaceExportWorkerService.name);
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private lastCleanupAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly exports: WorkspaceExportsService,
    private readonly handlers: ExportHandlerRegistry,
  ) {}

  isEnabled(): boolean {
    const flag = this.config.get<string>("EXPORT_WORKER_ENABLED")?.trim();
    if (flag === undefined || flag === "") {
      const legacy = this.config
        .get<string>("PRODUCT_EXPORT_WORKER_ENABLED")
        ?.trim();
      return legacy !== "false" && legacy !== "0";
    }
    return flag !== "false" && flag !== "0";
  }

  private getPollIntervalMs(): number {
    const raw =
      this.config.get<string>("EXPORT_WORKER_POLL_INTERVAL_MS") ??
      this.config.get<string>("PRODUCT_EXPORT_WORKER_POLL_INTERVAL_MS");
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 2000;
  }

  private getCleanupIntervalMs(): number {
    const raw =
      this.config.get<string>("EXPORT_CLEANUP_INTERVAL_MS") ??
      this.config.get<string>("PRODUCT_EXPORT_CLEANUP_INTERVAL_MS");
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : 15 * 60 * 1000;
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      this.log.log(
        "Workspace export worker disabled (EXPORT_WORKER_ENABLED=false)",
      );
      return;
    }
    // Defer start so handlers can register in their onModuleInit first.
    setImmediate(() => {
      if (!this.running) {
        this.log.log(
          `Starting workspace export worker handlers=${this.handlers.types().join(",") || "none"} pollIntervalMs=${this.getPollIntervalMs()}`,
        );
        this.running = true;
        this.loopPromise = this.runLoop();
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.loopPromise;
  }

  private async runLoop(): Promise<void> {
    const pollIntervalMs = this.getPollIntervalMs();
    const cleanupIntervalMs = this.getCleanupIntervalMs();

    while (this.running) {
      try {
        const now = Date.now();
        if (now - this.lastCleanupAt >= cleanupIntervalMs) {
          this.lastCleanupAt = now;
          try {
            const n = await this.exports.cleanupExpiredExports();
            if (n > 0) {
              this.log.log(`Expired export files cleaned count=${n}`);
            }
          } catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            this.log.warn(`Export cleanup error: ${err}`);
          }
        }

        const job = await this.exports.claimNextForProcessing();
        if (!job) {
          await this.sleep(pollIntervalMs);
          continue;
        }

        const handler = this.handlers.get(job.type);
        if (!handler) {
          this.log.error(
            `No export handler for type=${job.type} id=${job.id}`,
          );
          await this.exports.markFailed(
            job.id,
            "Непідтримуваний тип експорту",
          );
          continue;
        }

        this.log.log(
          `Export started id=${job.id} type=${job.type} mode=${job.mode} workspaceId=${job.workspaceId}`,
        );
        try {
          await handler.process(job);
          this.log.log(`Export finished id=${job.id}`);
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          this.log.error(`Export failed id=${job.id}: ${err}`);
          await this.exports.markFailed(job.id);
        }
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        this.log.error(`Export worker loop error: ${err}`);
        await this.sleep(pollIntervalMs);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
