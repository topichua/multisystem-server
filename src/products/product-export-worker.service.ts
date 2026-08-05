import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ProductExportsService } from "./product-exports.service";

@Injectable()
export class ProductExportWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly log = new Logger(ProductExportWorkerService.name);
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private lastCleanupAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly exports: ProductExportsService,
  ) {}

  isEnabled(): boolean {
    const flag = this.config
      .get<string>("PRODUCT_EXPORT_WORKER_ENABLED")
      ?.trim();
    return flag !== "false" && flag !== "0";
  }

  private getPollIntervalMs(): number {
    const raw = this.config.get<string>(
      "PRODUCT_EXPORT_WORKER_POLL_INTERVAL_MS",
    );
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 2000;
  }

  private getCleanupIntervalMs(): number {
    const raw = this.config.get<string>(
      "PRODUCT_EXPORT_CLEANUP_INTERVAL_MS",
    );
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : 15 * 60 * 1000;
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      this.log.log(
        "Product export worker disabled (PRODUCT_EXPORT_WORKER_ENABLED=false)",
      );
      return;
    }
    this.log.log(
      `Starting product export worker pollIntervalMs=${this.getPollIntervalMs()}`,
    );
    this.running = true;
    this.loopPromise = this.runLoop();
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
              this.log.log(`Expired product export files cleaned count=${n}`);
            }
          } catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            this.log.warn(`Product export cleanup error: ${err}`);
          }
        }

        const job = await this.exports.claimNextForProcessing();
        if (!job) {
          await this.sleep(pollIntervalMs);
          continue;
        }

        this.log.log(
          `Product export started id=${job.id} workspaceId=${job.workspaceId} scope=${job.scope} format=${job.format}`,
        );
        await this.exports.processExportJob(job);
        this.log.log(`Product export finished id=${job.id}`);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        this.log.error(`Product export worker loop error: ${err}`);
        await this.sleep(pollIntervalMs);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
