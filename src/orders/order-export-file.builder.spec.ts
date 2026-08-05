import {
  buildOrderExportFile,
  buildOrderExportHeaders,
  buildOrderExportRows,
} from "./order-export-file.builder";
import type { Order, OrderItem } from "../database/entities";
import { OrderPaymentStatus } from "../database/entities/order-payment-status.enum";
import { OrderStatusCategory } from "../database/entities/order-status-category.enum";
import { OrderSource } from "../database/entities/order-source.enum";
import { escapeCsvField } from "../exports/export-file.util";
import { mapOrderExportToListQuery } from "./dto/order-export-query.mapper";
import {
  OrderExportFormat,
  OrderExportMode,
} from "./dto/create-order-export.dto";

function makeOrder(partial: Partial<Order> & { id: number }): Order {
  return {
    workspaceId: 1,
    id: partial.id,
    customerId: 1,
    statusId: 1,
    source: OrderSource.manual,
    paymentStatus: OrderPaymentStatus.partial,
    currency: "UAH",
    subtotalAmount: 1000,
    discountAmount: 50,
    deliveryAmount: 80,
    totalAmount: 1030,
    customerNote: "note",
    internalNote: null,
    createdAt: new Date("2026-01-01T10:00:00.000Z"),
    updatedAt: new Date("2026-01-02T10:00:00.000Z"),
    createdById: 1,
    customer: {
      firstName: "Ivan",
      lastName: "Petrenko",
      phone: "+380501112233",
    } as never,
    status: {
      name: "Новий",
      category: OrderStatusCategory.new,
    } as never,
    deliveryInfo: {
      trackingNumber: "TTN123",
      deliveryStatus: "pending",
      provider: "nova_poshta",
    } as never,
    deliveryType: "nova_poshta" as never,
    items: partial.items ?? [],
    ...partial,
  } as Order;
}

function makeItem(partial: Partial<OrderItem> & { id: number }): OrderItem {
  return {
    id: partial.id,
    workspaceId: 1,
    orderId: 1001,
    quantity: 2,
    unitPriceAmount: 500,
    discountAmount: 0,
    totalPriceAmount: 1000,
    productTitleSnapshot: "Худі",
    variantTitleSnapshot: "Червоний / M",
    skuSnapshot: "SKU-1",
    variantAttributesSnapshot: { color: "red", size: "M" },
    ...partial,
  } as OrderItem;
}

describe("mapOrderExportToListQuery", () => {
  it("maps list filters without pagination", () => {
    const q = mapOrderExportToListQuery({
      type: OrderExportMode.orders,
      format: OrderExportFormat.xlsx,
      filters: {
        keyword: "test",
        statuses: [1, 2],
        createdAtFrom: "2026-01-01",
        totalFrom: 100,
        sources: ["instagram"],
      },
    });
    expect(q.keyword).toBe("test");
    expect(q.statuses).toEqual([1, 2]);
    expect(q.createdFrom).toBe("2026-01-01");
    expect(q.totalPriceFrom).toBe(100);
    expect(q.sources).toEqual(["instagram"]);
    expect(q.page).toBeUndefined();
  });
});

describe("order export file", () => {
  it("builds one row per order", async () => {
    const order = makeOrder({ id: 1001 });
    const file = await buildOrderExportFile({
      mode: "orders",
      contexts: [
        {
          order,
          paidAmount: 300,
          paymentMethodName: "Cash",
          managerName: "Admin",
        },
      ],
      format: "csv",
      fileName: "orders.csv",
    });
    const text = file.buffer.toString("utf8");
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).split("\n");
    expect(buildOrderExportHeaders("orders")).toContain("Order Number");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("1001");
    expect(lines[1]).toContain("300");
    expect(lines[1]).toContain("Cash");
    expect(lines[1].split(";").length).toBe(
      buildOrderExportHeaders("orders").length,
    );
  });

  it("builds one row per order item with repeated order columns", async () => {
    const order = makeOrder({
      id: 1001,
      items: [makeItem({ id: 1 }), makeItem({ id: 2, skuSnapshot: "SKU-2" })],
    });
    const rows = buildOrderExportRows("order_items", [
      {
        order,
        paidAmount: 0,
        paymentMethodName: "",
        managerName: "M",
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe(1001);
    expect(rows[1][0]).toBe(1001);
    expect(rows[0][21]).toBe("SKU-1");
    expect(rows[1][21]).toBe("SKU-2");
  });

  it("escapes CSV semicolons and quotes", () => {
    expect(escapeCsvField('a;b "c"')).toBe('"a;b ""c"""');
  });
});
