import { NormalizedDeliveryStatus } from "../delivery/normalized-delivery-status.enum";

export type NovaPoshtaTrackingDocument = {
  Number?: string;
  Status?: string;
  StatusCode?: string;
  WarehouseRecipient?: string;
  WarehouseSender?: string;
  DateCreated?: string;
  DateScan?: string;
  DateReceived?: string;
  RecipientDateTime?: string;
  RecipientFullName?: string;
  CityRecipient?: string;
  CitySender?: string;
  Redelivery?: string;
  ScheduledDeliveryDate?: string;
};

/** Representative StatusCode per normalized step (dev simulation + docs). */
export const NOVA_POSHTA_SIMULATED_STATUS_CODES: Record<
  NormalizedDeliveryStatus,
  { statusCode: string; status: string }
> = {
  [NormalizedDeliveryStatus.CREATED]: {
    statusCode: "1",
    status: "Нова пошта очікує надходження від відправника",
  },
  [NormalizedDeliveryStatus.IN_TRANSIT]: {
    statusCode: "5",
    status: "Відправлення прямує до міста одержувача",
  },
  [NormalizedDeliveryStatus.ARRIVED]: {
    statusCode: "7",
    status: "Прибув на відділення",
  },
  [NormalizedDeliveryStatus.DELIVERED]: {
    statusCode: "9",
    status: "Відправлення отримано",
  },
  [NormalizedDeliveryStatus.RETURNED]: {
    statusCode: "106",
    status: "Отримано зворотну експрес-накладну",
  },
  [NormalizedDeliveryStatus.DELIVERY_FAILED]: {
    statusCode: "102",
    status: "Відмова одержувача",
  },
};

const IN_TRANSIT_CODES = new Set(["4", "41", "5", "6", "101"]);

const ARRIVED_CODES = new Set(["7", "8", "14"]);

const DELIVERED_CODES = new Set(["9", "10", "11"]);

const RETURNED_CODES = new Set(["106", "107"]);

const FAILED_CODES = new Set(["102", "103", "108", "105"]);

export function mapNovaPoshtaStatusCodeToNormalized(
  statusCode: string | number | null | undefined,
): NormalizedDeliveryStatus | null {
  const code = String(statusCode ?? "").trim();
  if (!code) {
    return null;
  }

  if (code === "1") {
    return NormalizedDeliveryStatus.CREATED;
  }
  if (IN_TRANSIT_CODES.has(code)) {
    return NormalizedDeliveryStatus.IN_TRANSIT;
  }
  if (ARRIVED_CODES.has(code)) {
    return NormalizedDeliveryStatus.ARRIVED;
  }
  if (DELIVERED_CODES.has(code)) {
    return NormalizedDeliveryStatus.DELIVERED;
  }
  if (RETURNED_CODES.has(code)) {
    return NormalizedDeliveryStatus.RETURNED;
  }
  if (FAILED_CODES.has(code)) {
    return NormalizedDeliveryStatus.DELIVERY_FAILED;
  }

  return null;
}

export function buildSimulatedNovaPoshtaTrackingDocument(
  trackingNumber: string,
  normalizedStatus: NormalizedDeliveryStatus,
): NovaPoshtaTrackingDocument {
  const sample = NOVA_POSHTA_SIMULATED_STATUS_CODES[normalizedStatus];
  return {
    Number: trackingNumber,
    StatusCode: sample.statusCode,
    Status: sample.status,
    DateScan: new Date().toISOString(),
  };
}
