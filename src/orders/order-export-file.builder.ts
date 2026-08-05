import type { Order, OrderItem } from "../database/entities";
import type { ExportCell } from "../exports/export-file.util";
import {
  buildTabularExportFile,
  type TabularExportFileResult,
} from "../exports/export-file.util";

export type OrderExportMode = "orders" | "order_items";

export type OrderExportRowContext = {
  order: Order;
  paidAmount: number;
  paymentMethodName: string;
  managerName: string;
};

const ORDER_HEADERS = [
  "Order Number",
  "Status",
  "Created At",
  "Completed At",
  "Manager",
  "Channel",
  "Customer Name",
  "Customer Phone",
  "Customer Email",
  "Payment Status",
  "Payment Method",
  "Paid Amount",
  "Delivery Service",
  "Tracking Number",
  "Delivery Status",
  "Subtotal",
  "Discount",
  "Delivery Price",
  "Total",
  "Currency",
  "Notes",
] as const;

const ITEM_EXTRA_HEADERS = [
  "SKU",
  "Product Name",
  "Variant Name",
  "Variant Attributes",
  "Quantity",
  "Unit Price",
  "Discount",
  "Line Total",
] as const;

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

function customerName(order: Order): string {
  const c = order.customer;
  if (!c) return "";
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
}

function formatAttributes(
  attrs: Record<string, unknown> | null | undefined,
): string {
  if (!attrs || typeof attrs !== "object") return "";
  return Object.entries(attrs)
    .map(([k, v]) => `${k}: ${v == null ? "" : String(v)}`)
    .join("; ");
}

function notes(order: Order): string {
  const parts = [order.customerNote, order.internalNote]
    .map((s) => s?.trim())
    .filter(Boolean);
  return parts.join(" | ");
}

/** When status category is completed, surface updatedAt as best-effort completion time. */
function completedAt(order: Order): string {
  if (order.status?.category === "completed") {
    return formatDate(order.updatedAt);
  }
  return "";
}

export function orderHeaderCells(ctx: OrderExportRowContext): ExportCell[] {
  const { order, paidAmount, paymentMethodName, managerName } = ctx;
  const delivery = order.deliveryInfo;
  return [
    order.id,
    order.status?.name ?? "",
    formatDate(order.createdAt),
    completedAt(order),
    managerName,
    order.source ?? "",
    customerName(order),
    order.customer?.phone ?? "",
    "", // Customer email — not stored on Client
    order.paymentStatus ?? order.payment?.status ?? "",
    paymentMethodName,
    paidAmount,
    order.deliveryType ?? delivery?.provider ?? "",
    delivery?.trackingNumber ?? "",
    delivery?.deliveryStatus ?? "",
    order.subtotalAmount ?? 0,
    order.discountAmount ?? 0,
    order.deliveryAmount ?? 0,
    order.totalAmount ?? 0,
    order.currency ?? "",
    notes(order),
  ];
}

export function orderItemCells(item: OrderItem): ExportCell[] {
  return [
    item.skuSnapshot ?? "",
    item.productTitleSnapshot ?? "",
    item.variantTitleSnapshot ?? "",
    formatAttributes(item.variantAttributesSnapshot),
    item.quantity ?? 0,
    item.unitPriceAmount ?? 0,
    item.discountAmount ?? 0,
    item.totalPriceAmount ?? 0,
  ];
}

export function buildOrderExportHeaders(mode: OrderExportMode): string[] {
  if (mode === "order_items") {
    return [...ORDER_HEADERS, ...ITEM_EXTRA_HEADERS];
  }
  return [...ORDER_HEADERS];
}

export function buildOrderExportRows(
  mode: OrderExportMode,
  contexts: OrderExportRowContext[],
): ExportCell[][] {
  const rows: ExportCell[][] = [];
  if (mode === "orders") {
    for (const ctx of contexts) {
      rows.push(orderHeaderCells(ctx));
    }
    return rows;
  }
  for (const ctx of contexts) {
    const items = ctx.order.items ?? [];
    if (items.length === 0) {
      rows.push([...orderHeaderCells(ctx), ...Array(ITEM_EXTRA_HEADERS.length).fill("")]);
      continue;
    }
    for (const item of items) {
      rows.push([...orderHeaderCells(ctx), ...orderItemCells(item)]);
    }
  }
  return rows;
}

export async function buildOrderExportFile(params: {
  mode: OrderExportMode;
  contexts: OrderExportRowContext[];
  format: "xlsx" | "csv";
  fileName: string;
}): Promise<TabularExportFileResult> {
  const headers = buildOrderExportHeaders(params.mode);
  const rows = buildOrderExportRows(params.mode, params.contexts);
  const sheetName = params.mode === "order_items" ? "Order Items" : "Orders";
  return buildTabularExportFile({
    sheetName,
    headers,
    rows,
    format: params.format,
    fileName: params.fileName,
  });
}
