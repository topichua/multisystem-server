import type { EntityManager, Repository } from "typeorm";
import { OrderEvent } from "../database/entities";

/** Order timeline events for payment lifecycle. */
export const OrderPaymentEventType = {
  PAYMENT_CREATED: "order.payment_created",
  PAYMENT_CANCELLED: "order.payment_cancelled",
  PAYMENT_SUCCEEDED: "order.payment_succeeded",
  PAYMENT_REFUND_REQUESTED: "order.payment_refund_requested",
  PAYMENT_REFUNDED: "order.payment_refunded",
  PAYMENT_REFUND_CANCELLED: "order.payment_refund_cancelled",
} as const;

export async function appendOrderPaymentEvent(
  repoOrManager: Repository<OrderEvent> | EntityManager,
  input: {
    workspaceId: number;
    orderId: number;
    type: (typeof OrderPaymentEventType)[keyof typeof OrderPaymentEventType];
    actorId?: number | null;
    payload?: Record<string, unknown> | null;
  },
): Promise<void> {
  const repo =
    "getRepository" in repoOrManager
      ? repoOrManager.getRepository(OrderEvent)
      : repoOrManager;
  const actorId = input.actorId ?? null;
  await repo.save(
    repo.create({
      workspaceId: input.workspaceId,
      orderId: input.orderId,
      type: input.type,
      actorId,
      userId: actorId,
      payload: input.payload ?? null,
    }),
  );
}
