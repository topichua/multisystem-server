import { OrderDeliveryStatus } from "../database/entities/order-delivery-status.enum";
import { NormalizedDeliveryStatus } from "./normalized-delivery-status.enum";

export const NORMALIZED_TO_ORDER_DELIVERY_STATUS: Record<
  NormalizedDeliveryStatus,
  OrderDeliveryStatus
> = {
  [NormalizedDeliveryStatus.CREATED]: OrderDeliveryStatus.waybill_created,
  [NormalizedDeliveryStatus.IN_TRANSIT]: OrderDeliveryStatus.shipped,
  [NormalizedDeliveryStatus.ARRIVED]: OrderDeliveryStatus.at_branch,
  [NormalizedDeliveryStatus.DELIVERED]: OrderDeliveryStatus.delivered,
  [NormalizedDeliveryStatus.RETURNED]: OrderDeliveryStatus.returned,
  [NormalizedDeliveryStatus.DELIVERY_FAILED]:
    OrderDeliveryStatus.delivery_failed,
};

export const DEV_SIMULATOR_STATUS_LABELS: Record<
  NormalizedDeliveryStatus,
  string
> = {
  [NormalizedDeliveryStatus.CREATED]: "ТТН створено (dev)",
  [NormalizedDeliveryStatus.IN_TRANSIT]: "В дорозі (dev)",
  [NormalizedDeliveryStatus.ARRIVED]: "На відділенні (dev)",
  [NormalizedDeliveryStatus.DELIVERED]: "Отримано (dev)",
  [NormalizedDeliveryStatus.RETURNED]: "Повернення (dev)",
  [NormalizedDeliveryStatus.DELIVERY_FAILED]: "Помилка доставки (dev)",
};

export const DEV_SIMULATOR_RAW_STATUS_CODES: Record<
  NormalizedDeliveryStatus,
  string
> = {
  [NormalizedDeliveryStatus.CREATED]: "DEV_CREATED",
  [NormalizedDeliveryStatus.IN_TRANSIT]: "DEV_IN_TRANSIT",
  [NormalizedDeliveryStatus.ARRIVED]: "DEV_ARRIVED",
  [NormalizedDeliveryStatus.DELIVERED]: "DEV_DELIVERED",
  [NormalizedDeliveryStatus.RETURNED]: "DEV_RETURNED",
  [NormalizedDeliveryStatus.DELIVERY_FAILED]: "DEV_DELIVERY_FAILED",
};
