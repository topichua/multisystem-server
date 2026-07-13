import { OrderDeliveryStatus } from "../../database/entities/order-delivery-status.enum";
import { OrderPaymentStatus } from "../../database/entities/order-payment-status.enum";

export type AutomationCriteriaItem = {
  id: string;
  name: string;
};

const DELIVERY_STATUS_LABELS: Record<OrderDeliveryStatus, string> = {
  [OrderDeliveryStatus.pending]: "Очікує доставку",
  [OrderDeliveryStatus.waybill_created]: "ТТН створено",
  [OrderDeliveryStatus.shipped]: "Передано перевізнику",
  [OrderDeliveryStatus.at_branch]: "На відділенні",
  [OrderDeliveryStatus.delivered]: "Отримано",
  [OrderDeliveryStatus.delivery_failed]: "Помилка доставки",
  [OrderDeliveryStatus.returned]: "Повернення",
};

const PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
  [OrderPaymentStatus.unpaid]: "Не оплачено",
  [OrderPaymentStatus.partial]: "Частково оплачено",
  [OrderPaymentStatus.paid]: "Оплачено",
  [OrderPaymentStatus.overpaid]: "Переплата",
  [OrderPaymentStatus.refunded]: "Повернення коштів",
};

const DELIVERY_STATUS_ORDER: OrderDeliveryStatus[] = [
  OrderDeliveryStatus.pending,
  OrderDeliveryStatus.waybill_created,
  OrderDeliveryStatus.shipped,
  OrderDeliveryStatus.at_branch,
  OrderDeliveryStatus.delivered,
  OrderDeliveryStatus.delivery_failed,
  OrderDeliveryStatus.returned,
];

const PAYMENT_STATUS_ORDER: OrderPaymentStatus[] = [
  OrderPaymentStatus.unpaid,
  OrderPaymentStatus.partial,
  OrderPaymentStatus.paid,
  OrderPaymentStatus.overpaid,
  OrderPaymentStatus.refunded,
];

export function buildAutomationRuleCriteria(): {
  delivery: AutomationCriteriaItem[];
  payment: AutomationCriteriaItem[];
} {
  return {
    delivery: DELIVERY_STATUS_ORDER.map((id) => ({
      id,
      name: DELIVERY_STATUS_LABELS[id],
    })),
    payment: PAYMENT_STATUS_ORDER.map((id) => ({
      id,
      name: PAYMENT_STATUS_LABELS[id],
    })),
  };
}
