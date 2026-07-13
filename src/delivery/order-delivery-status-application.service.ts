import { Inject, Injectable, Optional, forwardRef } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  AutomationSourceType,
  Order,
  OrderDeliveryInfo,
  OrderDeliveryStatus,
} from "../database/entities";
import { OrderStatusAutomationTriggerService } from "../order-status-automations/order-status-automation-trigger.service";

export type ApplyDeliveryStatusChangeInput = {
  delivery: OrderDeliveryInfo;
  newDeliveryStatus: OrderDeliveryStatus;
  providerStatusCode?: string | null;
  providerStatusText?: string | null;
  /** Notify automations even when status value did not change (initial assignment). */
  forceNotify?: boolean;
};

export type ApplyDeliveryStatusChangeResult = {
  changed: boolean;
  previousStatus: OrderDeliveryStatus;
  newStatus: OrderDeliveryStatus;
  statusChangedAt: Date | null;
};

@Injectable()
export class OrderDeliveryStatusApplicationService {
  constructor(
    @InjectRepository(OrderDeliveryInfo)
    private readonly deliveryRepo: Repository<OrderDeliveryInfo>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @Optional()
    @Inject(forwardRef(() => OrderStatusAutomationTriggerService))
    private readonly automationTrigger?: OrderStatusAutomationTriggerService,
  ) {}

  async applyDeliveryStatusChange(
    input: ApplyDeliveryStatusChangeInput,
  ): Promise<ApplyDeliveryStatusChangeResult> {
    const { delivery } = input;
    const previousStatus = delivery.deliveryStatus;
    const changed = previousStatus !== input.newDeliveryStatus;

    delivery.deliveryStatus = input.newDeliveryStatus;
    if (input.providerStatusCode !== undefined) {
      delivery.providerStatusCode = input.providerStatusCode?.trim() || null;
    }
    if (input.providerStatusText !== undefined) {
      delivery.providerStatusText = input.providerStatusText?.trim() || null;
    }

    let statusChangedAt = delivery.deliveryStatusAt;
    if (changed) {
      statusChangedAt = new Date();
      delivery.deliveryStatusAt = statusChangedAt;
    }

    await this.deliveryRepo.save(delivery);

    if ((changed || input.forceNotify) && this.automationTrigger) {
      const order = await this.orderRepo.findOne({
        where: { deliveryId: delivery.id },
      });
      if (order) {
        const statusChangedAt = delivery.deliveryStatusAt ?? new Date();
        await this.automationTrigger.onSourceStatusChanged({
          workspaceId: order.workspaceId,
          orderId: order.id,
          sourceType: AutomationSourceType.delivery_status,
          sourceStatus: delivery.deliveryStatus,
          previousSourceStatus: previousStatus,
          statusChangedAt,
          changed: true,
        });
      }
    }

    return {
      changed,
      previousStatus,
      newStatus: delivery.deliveryStatus,
      statusChangedAt,
    };
  }
}
