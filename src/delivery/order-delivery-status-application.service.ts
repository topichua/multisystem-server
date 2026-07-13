import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";
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

export type ChangeDeliveryStatusInput = {
  deliveryId: number;
  newDeliveryStatus: OrderDeliveryStatus;
  providerStatusCode?: string | null;
  providerStatusText?: string | null;
};

@Injectable()
export class OrderDeliveryStatusApplicationService {
  private readonly log = new Logger(OrderDeliveryStatusApplicationService.name);

  constructor(
    @InjectRepository(OrderDeliveryInfo)
    private readonly deliveryRepo: Repository<OrderDeliveryInfo>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @Inject(forwardRef(() => OrderStatusAutomationTriggerService))
    private readonly automationTrigger: OrderStatusAutomationTriggerService,
  ) {}

  /** Central entry point: updates delivery status and triggers order automations. */
  async changeDeliveryStatus(
    input: ChangeDeliveryStatusInput,
  ): Promise<ApplyDeliveryStatusChangeResult & { delivery: OrderDeliveryInfo }> {
    const delivery = await this.deliveryRepo.findOne({
      where: { id: input.deliveryId },
    });
    if (!delivery) {
      throw new NotFoundException("Delivery not found");
    }

    const result = await this.applyDeliveryStatusChange({
      delivery,
      newDeliveryStatus: input.newDeliveryStatus,
      providerStatusCode: input.providerStatusCode,
      providerStatusText: input.providerStatusText,
    });

    return {
      ...result,
      delivery,
    };
  }

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

    if (changed || input.forceNotify) {
      const order = await this.orderRepo.findOne({
        where: { deliveryId: delivery.id },
      });
      if (order) {
        const automationChangedAt = delivery.deliveryStatusAt ?? new Date();
        this.log.log(
          `Notifying automations deliveryStatus=${delivery.deliveryStatus} workspace=${order.workspaceId} order=${order.id} changed=${changed}`,
        );
        await this.automationTrigger.onSourceStatusChanged({
          workspaceId: order.workspaceId,
          orderId: order.id,
          sourceType: AutomationSourceType.delivery_status,
          sourceStatus: delivery.deliveryStatus,
          previousSourceStatus: previousStatus,
          statusChangedAt: automationChangedAt,
          changed: changed || Boolean(input.forceNotify),
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
