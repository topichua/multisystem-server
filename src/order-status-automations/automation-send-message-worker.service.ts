import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AutomationSendMessageService } from "./automation-send-message.service";

@Injectable()
export class AutomationSendMessageWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly log = new Logger(AutomationSendMessageWorkerService.name);
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly sendMessage: AutomationSendMessageService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.log.log(
        "Automation SEND_MESSAGE worker disabled (AUTOMATION_SEND_MESSAGE_WORKER_ENABLED=false)",
      );
      return;
    }
    this.running = true;
    this.scheduleNext(1_000);
    this.log.log(
      `Automation SEND_MESSAGE worker started intervalMs=${this.getIntervalMs()} batchSize=${this.getBatchSize()}`,
    );
  }

  onModuleDestroy(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private isEnabled(): boolean {
    const flag = this.config
      .get<string>("AUTOMATION_SEND_MESSAGE_WORKER_ENABLED")
      ?.trim();
    return flag !== "false" && flag !== "0";
  }

  private getIntervalMs(): number {
    const raw = this.config.get<string>(
      "AUTOMATION_SEND_MESSAGE_WORKER_INTERVAL_MS",
    );
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15_000;
  }

  private getBatchSize(): number {
    const raw = this.config.get<string>(
      "AUTOMATION_SEND_MESSAGE_WORKER_BATCH_SIZE",
    );
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
  }

  private scheduleNext(delayMs = this.getIntervalMs()): void {
    if (!this.running) {
      return;
    }
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    try {
      const processed = await this.sendMessage.processDueJobs(
        this.getBatchSize(),
      );
      if (processed > 0) {
        this.log.log(`Automation SEND_MESSAGE worker processed=${processed}`);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown worker error";
      this.log.error(`Automation SEND_MESSAGE worker tick failed: ${message}`);
    } finally {
      this.scheduleNext();
    }
  }
}
