import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from "@nestjs/common";
import type { EntityManager } from "typeorm";
import {
  AutomationSourceType,
  Order,
  OrderPaymentStatus,
  PaymentTransaction,
  PaymentTransactionStatus,
  PaymentTransactionType,
} from "../database/entities";
import {
  calculateOrderPaymentStatus,
  calculatePaidAmount,
} from "./logic/order-payment-status.logic";
import { OrderStatusAutomationTriggerService } from "../order-status-automations/order-status-automation-trigger.service";

export type UpdateOrderPaymentStatusResult = {
  paymentStatus: OrderPaymentStatus;
  previousPaymentStatus: OrderPaymentStatus;
  changed: boolean;
  paymentStatusAt: Date | null;
};

@Injectable()
export class OrderPaymentStatusApplicationService {
  constructor(
    @Optional()
    @Inject(forwardRef(() => OrderStatusAutomationTriggerService))
    private readonly automationTrigger?: OrderStatusAutomationTriggerService,
  ) {}

  async updateOrderPaymentStatus(
    manager: EntityManager,
    workspaceId: number,
    orderId: number,
  ): Promise<UpdateOrderPaymentStatusResult> {
    const order = await manager.getRepository(Order).findOne({
      where: { workspaceId, id: orderId },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }

    const transactions = await manager.getRepository(PaymentTransaction).find({
      where: { workspaceId, orderId },
    });

    const paidAmount = calculatePaidAmount(transactions);
    const previousPaymentStatus = order.paymentStatus;
    const paymentStatus = calculateOrderPaymentStatus(
      order.totalAmount,
      paidAmount,
    );
    const changed = paymentStatus !== previousPaymentStatus;

    order.paymentStatus = paymentStatus;
    if (changed) {
      order.paymentStatusAt = new Date();
    }

    if (
      paymentStatus === OrderPaymentStatus.paid ||
      paymentStatus === OrderPaymentStatus.overpaid
    ) {
      if (!order.paidAt) {
        const latestCharge = transactions
          .filter(
            (t) =>
              t.type === PaymentTransactionType.charge &&
              t.status === PaymentTransactionStatus.succeeded,
          )
          .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
        order.paidAt = latestCharge?.occurredAt ?? new Date();
      }
    } else if (paymentStatus === OrderPaymentStatus.unpaid) {
      order.paidAt = null;
    }

    await manager.getRepository(Order).save(order);

    return {
      paymentStatus,
      previousPaymentStatus,
      changed,
      paymentStatusAt: order.paymentStatusAt,
    };
  }

  async notifyPaymentStatusChangeIfNeeded(
    workspaceId: number,
    orderId: number,
    result: UpdateOrderPaymentStatusResult,
  ): Promise<void> {
    if (!result.changed || !this.automationTrigger || !result.paymentStatusAt) {
      return;
    }
    await this.automationTrigger.onSourceStatusChanged({
      workspaceId,
      orderId,
      sourceType: AutomationSourceType.payment_status,
      sourceStatus: result.paymentStatus,
      previousSourceStatus: result.previousPaymentStatus,
      statusChangedAt: result.paymentStatusAt,
      changed: true,
    });
  }
}
