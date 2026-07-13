import { Injectable, Logger } from "@nestjs/common";
import { AutomationSourceType } from "../database/entities";
import { OrderStatusAutomationExecutorService } from "./order-status-automation-executor.service";

export type StatusChangeNotification = {
  workspaceId: number;
  orderId: number;
  sourceType: AutomationSourceType;
  sourceStatus: string;
  previousSourceStatus: string;
  statusChangedAt: Date;
  changed: boolean;
};

@Injectable()
export class OrderStatusAutomationTriggerService {
  private readonly log = new Logger(OrderStatusAutomationTriggerService.name);

  constructor(
    private readonly executor: OrderStatusAutomationExecutorService,
  ) {}

  async onSourceStatusChanged(
    input: StatusChangeNotification,
  ): Promise<void> {
    if (!input.changed) {
      return;
    }

    try {
      await this.executor.evaluateImmediateRules({
        workspaceId: input.workspaceId,
        orderId: input.orderId,
        sourceType: input.sourceType,
        sourceStatus: input.sourceStatus,
        statusChangedAt: input.statusChangedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error(
        `Automation trigger failed workspace=${input.workspaceId} order=${input.orderId}: ${message}`,
      );
    }
  }
}
