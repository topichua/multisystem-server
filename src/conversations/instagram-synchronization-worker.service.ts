import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InstagramSynchronizationsService } from "../instagram/instagram-synchronizations.service";
import { ConversationsService } from "./conversations.service";

@Injectable()
export class InstagramSynchronizationWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly log = new Logger(
    InstagramSynchronizationWorkerService.name,
  );
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly synchronizations: InstagramSynchronizationsService,
    private readonly conversations: ConversationsService,
  ) {}

  isEnabled(): boolean {
    const flag = this.config
      .get<string>("INSTAGRAM_SYNC_WORKER_ENABLED")
      ?.trim();
    return flag !== "false" && flag !== "0";
  }

  private getPollIntervalMs(): number {
    const raw = this.config.get<string>(
      "INSTAGRAM_SYNC_WORKER_POLL_INTERVAL_MS",
    );
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 2000;
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      this.log.log(
        "Instagram sync worker disabled (INSTAGRAM_SYNC_WORKER_ENABLED=false)",
      );
      return;
    }

    this.log.log(
      `Starting Instagram sync worker pollIntervalMs=${this.getPollIntervalMs()}`,
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

    while (this.running) {
      try {
        const job = await this.synchronizations.claimNextForProcessing();
        if (!job) {
          await this.sleep(pollIntervalMs);
          continue;
        }

        this.log.log(
          `Instagram sync started id=${job.id} workspaceId=${job.workspaceId} integrationId=${job.integrationId} since=${job.sinceAt.toISOString()}`,
        );

        try {
          await this.conversations.runInstagramHistorySynchronization(job, {
            onProgress: async (patch) => {
              await this.synchronizations.updateProgress(job.id, patch);
            },
          });
          await this.synchronizations.markCompleted(job.id);
          this.log.log(`Instagram sync completed id=${job.id}`);
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          this.log.error(`Instagram sync failed id=${job.id}: ${err}`);
          await this.synchronizations.markFailed(job.id, err);
        }
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        this.log.error(`Instagram sync worker loop error: ${err}`);
        await this.sleep(pollIntervalMs);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
