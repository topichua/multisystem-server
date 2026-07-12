import { OrderStatusCategory } from "./order-status-category.enum";

export type OrderStatusSystemDefault = {
  name: string;
  category: OrderStatusCategory;
  color: string;
  sortOrder: number;
  isDefault: boolean;
};

/** Seeded per workspace; matched by `category` + `isSystem: true`. */
export const ORDER_STATUS_SYSTEM_DEFAULTS: readonly OrderStatusSystemDefault[] =
  [
    {
      name: "New",
      category: OrderStatusCategory.new,
      color: "#6366f1",
      sortOrder: 0,
      isDefault: true,
    },
    {
      name: "Confirmed",
      category: OrderStatusCategory.confirmed,
      color: "#22c55e",
      sortOrder: 1,
      isDefault: false,
    },
    {
      name: "Delivery",
      category: OrderStatusCategory.delivery,
      color: "#a855f7",
      sortOrder: 2,
      isDefault: false,
    },
    {
      name: "Completed",
      category: OrderStatusCategory.completed,
      color: "#10b981",
      sortOrder: 3,
      isDefault: false,
    },
    {
      name: "Canceled",
      category: OrderStatusCategory.canceled,
      color: "#ef4444",
      sortOrder: 4,
      isDefault: false,
    },
    {
      name: "Returned",
      category: OrderStatusCategory.returned,
      color: "#f97316",
      sortOrder: 5,
      isDefault: false,
    },
  ] as const;
