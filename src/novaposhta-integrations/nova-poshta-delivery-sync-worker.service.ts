import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  AutomationSourceType,
  OrderDeliveryInfo,
  OrderDeliveryProvider,
} from "../database/entities";
import { OrderStatusAutomationExecutorService } from "../order-status-automations/order-status-automation-executor.service";
import { NovaPoshtaDeliveryTrackingService } from "./nova-poshta-delivery-tracking.service";

@Injectable()
export class NovaPoshtaDeliverySyncWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly log = new Logger(NovaPoshtaDeliverySyncWorkerService.name);
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(OrderDeliveryInfo)
    private readonly deliveryRepo: Repository<OrderDeliveryInfo>,
    private readonly tracking: NovaPoshtaDeliveryTrackingService,
    @Inject(forwardRef(() => OrderStatusAutomationExecutorService))
    private readonly automationExecutor: OrderStatusAutomationExecutorService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.log.log(
        "Nova Poshta delivery sync worker disabled (NOVA_POSHTA_DELIVERY_SYNC_WORKER_ENABLED=false)",
      );
      return;
    }

    this.running = true;
    this.scheduleNext(1_000);
    this.log.log(
      `Nova Poshta delivery sync worker started intervalMs=${this.getIntervalMs()} batchSize=${this.getBatchSize()}`,
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
      .get<string>("NOVA_POSHTA_DELIVERY_SYNC_WORKER_ENABLED")
      ?.trim();
    return flag !== "false" && flag !== "0";
  }

  private getIntervalMs(): number {
    const raw = this.config.get<string>(
      "NOVA_POSHTA_DELIVERY_SYNC_WORKER_INTERVAL_MS",
    );
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 60 * 60 * 1000;
  }

  private getBatchSize(): number {
    const raw = this.config.get<string>(
      "NOVA_POSHTA_DELIVERY_SYNC_WORKER_BATCH_SIZE",
    );
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 200;
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
      const deliveries = await this.deliveryRepo
        .createQueryBuilder("d")
        .where("d.provider = :provider", {
          provider: OrderDeliveryProvider.nova_poshta,
        })
        .andWhere("d.tracking_number IS NOT NULL")
        .andWhere("trim(d.tracking_number) != ''")
        .andWhere("d.phone IS NOT NULL")
        .andWhere("trim(d.phone) != ''")
        .orderBy("d.updated_at", "ASC")
        .limit(this.getBatchSize())
        .getMany();

      let synced = 0;
      let failed = 0;
      for (const delivery of deliveries) {
        try {
          await this.tracking.syncFromNovaPoshta(delivery.id, null);
          synced += 1;
        } catch (error) {
          failed += 1;
          const message =
            error instanceof Error ? error.message : String(error);
          this.log.warn(
            `Nova Poshta sync skipped delivery=${delivery.id}: ${message}`,
          );
        }
      }

      const evaluatedTimedRules =
        await this.automationExecutor.evaluateDueTimedRules({
          sourceType: AutomationSourceType.delivery_status,
          limitPerRule: this.getBatchSize(),
        });
      const evaluatedPaymentTimedRules =
        await this.automationExecutor.evaluateDueTimedRules({
          sourceType: AutomationSourceType.payment_status,
          limitPerRule: this.getBatchSize(),
        });
      const evaluatedOrderStatusTimedRules =
        await this.automationExecutor.evaluateDueTimedRules({
          sourceType: AutomationSourceType.order_status,
          limitPerRule: this.getBatchSize(),
        });

      this.log.log(
        `Nova Poshta sync finished synced=${synced} failed=${failed} deliveryTimedRulesEvaluated=${evaluatedTimedRules} paymentTimedRulesEvaluated=${evaluatedPaymentTimedRules} orderStatusTimedRulesEvaluated=${evaluatedOrderStatusTimedRules}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error(`Nova Poshta sync worker failed: ${message}`);
    } finally {
      this.scheduleNext();
    }
  }
}
