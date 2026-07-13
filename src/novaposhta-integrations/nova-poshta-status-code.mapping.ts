import { NormalizedDeliveryStatus } from "../delivery/normalized-delivery-status.enum";
import { OrderDeliveryDestinationType } from "../database/entities/order-delivery-destination-type.enum";
import { OrderDeliveryStatus } from "../database/entities/order-delivery-status.enum";
import { NORMALIZED_TO_ORDER_DELIVERY_STATUS } from "../delivery/delivery-status-mapping";

export type NovaPoshtaTrackingDocument = {
  Number?: string;
  Status?: string;
  StatusCode?: string;
  WarehouseRecipient?: string;
  WarehouseRecipientNumber?: string;
  WarehouseRecipientRef?: string;
  WarehouseRecipientInternetAddressRef?: string;
  WarehouseSender?: string;
  DateCreated?: string;
  DateScan?: string;
  DateReceived?: string;
  RecipientDateTime?: string;
  RecipientFullName?: string;
  CityRecipient?: string;
  RefCityRecipient?: string;
  RefSettlementRecipient?: string;
  CitySender?: string;
  Redelivery?: string;
  ScheduledDeliveryDate?: string;
  /** e.g. WarehouseWarehouse, WarehouseDoors, DoorsWarehouse, DoorsDoors */
  ServiceType?: string;
  /** Street ref (UUID) or formatted address for courier (doors) delivery. */
  RecipientAddress?: string;
  RecipientHouse?: string;
  RecipientFlat?: string;
  PhoneRecipient?: string;
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

export type NovaPoshtaDeliveryPatchFromTracking = {
  recipientName: string | null;
  city: string | null;
  cityRef: string | null;
  warehouse: string | null;
  warehouseRef: string | null;
  street: string | null;
  streetRef: string | null;
  building: string | null;
  flat: string | null;
  trackingNumber: string;
  providerStatusCode: string | null;
  providerStatusText: string | null;
  deliveryStatus: OrderDeliveryStatus;
  deliveryType: OrderDeliveryDestinationType | null;
};

const NOVA_POSHTA_REF_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isNovaPoshtaRef(value: string): boolean {
  return NOVA_POSHTA_REF_PATTERN.test(value.trim());
}

function resolveNovaPoshtaWarehouseRef(
  doc: NovaPoshtaTrackingDocument,
): string | null {
  return (
    doc.WarehouseRecipientRef?.trim() ||
    doc.WarehouseRecipientInternetAddressRef?.trim() ||
    null
  );
}

function resolveNovaPoshtaCityRef(
  doc: NovaPoshtaTrackingDocument,
): string | null {
  return (
    doc.RefSettlementRecipient?.trim() ||
    doc.RefCityRecipient?.trim() ||
    null
  );
}

/** Split NP `RecipientAddress` into street ref or street/building/flat parts. */
export function parseNovaPoshtaRecipientAddress(
  raw: string | null | undefined,
  explicitHouse?: string | null,
  explicitFlat?: string | null,
): {
  streetRef: string | null;
  street: string | null;
  building: string | null;
  flat: string | null;
} {
  const value = raw?.trim();
  if (!value) {
    return {
      streetRef: null,
      street: null,
      building: explicitHouse?.trim() || null,
      flat: explicitFlat?.trim() || null,
    };
  }

  if (isNovaPoshtaRef(value)) {
    return {
      streetRef: value,
      street: null,
      building: explicitHouse?.trim() || null,
      flat: explicitFlat?.trim() || null,
    };
  }

  let flat = explicitFlat?.trim() || null;
  let building = explicitHouse?.trim() || null;
  let remaining = value;

  if (!flat) {
    const flatMatch = remaining.match(
      /(?:^|[\s,])(?:кв\.?|квартира)\s*([0-9а-яіїєґА-ЯІЇЄҐ\-/]+)/iu,
    );
    if (flatMatch) {
      flat = flatMatch[1].trim();
      remaining = remaining
        .replace(flatMatch[0], "")
        .replace(/,\s*$/, "")
        .trim();
    }
  }

  if (!building) {
    const buildingMatch = remaining.match(
      /(?:^|[\s,])(?:буд\.?|будинок|д\.?|дом)\s*([0-9а-яіїєґА-ЯІЇЄҐ\-/]+)/iu,
    );
    if (buildingMatch) {
      building = buildingMatch[1].trim();
      remaining = remaining
        .replace(buildingMatch[0], "")
        .replace(/,\s*$/, "")
        .trim();
    }
  }

  if (!building) {
    const parts = remaining
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      if (/^[0-9]+[а-яіїєґА-ЯІЇЄҐ\-/]*$/iu.test(last)) {
        building = last;
        remaining = parts.slice(0, -1).join(", ");
      }
    }
  }

  return {
    streetRef: null,
    street: remaining || null,
    building,
    flat,
  };
}

function normalizeNovaPoshtaServiceType(
  raw: string | null | undefined,
): string | null {
  const value = raw?.trim();
  if (!value) {
    return null;
  }
  return value.replace(/_/g, "");
}

/** Recipient leg of NP ServiceType: Warehouse* → branch, *Doors → address. */
export function resolveNovaPoshtaDeliveryType(
  doc: NovaPoshtaTrackingDocument,
): OrderDeliveryDestinationType | null {
  const serviceType = normalizeNovaPoshtaServiceType(doc.ServiceType);
  if (serviceType) {
    if (serviceType.endsWith("Warehouse")) {
      return OrderDeliveryDestinationType.WAREHOUSE;
    }
    if (serviceType.endsWith("Doors")) {
      return OrderDeliveryDestinationType.ADDRESS;
    }
  }

  if (
    doc.WarehouseRecipient?.trim() ||
    doc.WarehouseRecipientNumber?.trim()
  ) {
    return OrderDeliveryDestinationType.WAREHOUSE;
  }

  if (doc.RecipientAddress?.trim()) {
    return OrderDeliveryDestinationType.ADDRESS;
  }

  return null;
}

/** Map Nova Poshta `getStatusDocuments` payload into order delivery fields. */
export function mapNovaPoshtaTrackingToDeliveryPatch(
  doc: NovaPoshtaTrackingDocument,
  trackingNumber: string,
): NovaPoshtaDeliveryPatchFromTracking {
  const normalized = mapNovaPoshtaStatusCodeToNormalized(doc.StatusCode);
  const deliveryStatus =
    normalized != null
      ? NORMALIZED_TO_ORDER_DELIVERY_STATUS[normalized]
      : OrderDeliveryStatus.waybill_created;

  const deliveryType = resolveNovaPoshtaDeliveryType(doc);
  const warehouse = doc.WarehouseRecipient?.trim() || null;
  const warehouseRef = resolveNovaPoshtaWarehouseRef(doc);
  const cityRef = resolveNovaPoshtaCityRef(doc);
  const addressParts =
    deliveryType === OrderDeliveryDestinationType.ADDRESS
      ? parseNovaPoshtaRecipientAddress(
          doc.RecipientAddress,
          doc.RecipientHouse,
          doc.RecipientFlat,
        )
      : {
          streetRef: null,
          street: null,
          building: null,
          flat: null,
        };

  return {
    recipientName: doc.RecipientFullName?.trim() || null,
    city: doc.CityRecipient?.trim() || null,
    cityRef,
    warehouse:
      deliveryType === OrderDeliveryDestinationType.WAREHOUSE ? warehouse : null,
    warehouseRef:
      deliveryType === OrderDeliveryDestinationType.WAREHOUSE
        ? warehouseRef
        : null,
    street: addressParts.street,
    streetRef: addressParts.streetRef,
    building: addressParts.building,
    flat: addressParts.flat,
    trackingNumber: doc.Number?.trim() || trackingNumber.trim(),
    providerStatusCode: String(doc.StatusCode ?? "").trim() || null,
    providerStatusText: doc.Status?.trim() || null,
    deliveryStatus,
    deliveryType,
  };
}
