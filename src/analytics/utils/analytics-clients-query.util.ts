import type { ObjectLiteral, SelectQueryBuilder } from "typeorm";
import { OrderStatusCategory } from "../../database/entities/order-status-category.enum";
import type { AnalyticsFilterContext } from "../types/analytics-filter-context";
import type { AnalyticsDateRange } from "../types/analytics-date-range.types";

/** Subquery alias: lifetime stats per customer from non-canceled orders. */
export function applyClientLifetimeOrderStatsJoin(
  qb: SelectQueryBuilder<ObjectLiteral>,
  context: AnalyticsFilterContext,
  statsAlias = "cls",
  orderAlias = "life_order",
  statusAlias = "life_status",
): SelectQueryBuilder<ObjectLiteral> {
  return qb.from(
    (sub) => {
      sub
        .select(`${orderAlias}.customerId`, "customer_id")
        .addSelect(`MIN(${orderAlias}.createdAt)`, "first_order_at")
        .addSelect(`MAX(${orderAlias}.createdAt)`, "last_order_at")
        .addSelect(`COUNT(${orderAlias}.id)`, "order_count")
        .addSelect(
          `COALESCE(SUM(${orderAlias}.totalAmount), 0)`,
          "lifetime_revenue",
        )
        .from("orders", orderAlias)
        .leftJoin(
          `${orderAlias}.status`,
          statusAlias,
        )
        .where(`${orderAlias}.workspaceId = :clientsWorkspaceId`, {
          clientsWorkspaceId: context.workspaceId,
        })
        .andWhere(`${statusAlias}.category != :clientsCanceledCategory`, {
          clientsCanceledCategory: OrderStatusCategory.canceled,
        })
        .groupBy(`${orderAlias}.customerId`);
      return sub;
    },
    statsAlias,
  );
}

export function applyNonCanceledOrdersScope(
  qb: SelectQueryBuilder<ObjectLiteral>,
  orderAlias: string,
  context: AnalyticsFilterContext,
  statusAlias = "clientAnalyticsStatus",
): void {
  qb.andWhere(`${orderAlias}.workspaceId = :clientsAnalyticsWorkspaceId`, {
    clientsAnalyticsWorkspaceId: context.workspaceId,
  })
    .leftJoin(`${orderAlias}.status`, statusAlias)
    .andWhere(`${statusAlias}.category != :clientAnalyticsCanceled`, {
      clientAnalyticsCanceled: OrderStatusCategory.canceled,
    });
}

export function applyOrderCreatedRange(
  qb: SelectQueryBuilder<ObjectLiteral>,
  orderAlias: string,
  range: AnalyticsDateRange,
  fromKey = "clientRangeFrom",
  toKey = "clientRangeTo",
): void {
  qb.andWhere(`${orderAlias}.createdAt >= :${fromKey}`, {
    [fromKey]: range.from,
  }).andWhere(`${orderAlias}.createdAt <= :${toKey}`, {
    [toKey]: range.to,
  });
}

/**
 * Gross profit line expression (same logic as overview KPI).
 */
export const ORDER_ITEM_GROSS_PROFIT_SQL = `COALESCE(
  oi.profit_amount,
  CASE
    WHEN oi.total_cost_amount IS NOT NULL THEN
      COALESCE(oi.total_sale_amount, oi.total_price_amount, 0)
        - oi.total_cost_amount
    WHEN oi.unit_cost_snapshot IS NOT NULL THEN
      COALESCE(oi.total_sale_amount, oi.total_price_amount, 0)
        - (oi.unit_cost_snapshot * oi.quantity)
    ELSE 0
  END
)`;

export const CLIENT_ACQUISITION_SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  telegram: "Telegram",
  tiktok: "TikTok",
  manual: "Вручну",
  mobile: "Сайт",
  marketplace: "Marketplace",
};

export function resolveClientAcquisitionSourceLabel(source: string): string {
  const normalized = source.trim().toLowerCase();
  if (!normalized) {
    return "Інше";
  }
  return (
    CLIENT_ACQUISITION_SOURCE_LABELS[normalized] ??
    normalized.charAt(0).toUpperCase() + normalized.slice(1)
  );
}

export function buildClientDisplayName(client: {
  firstName?: string | null;
  lastName?: string | null;
}): string {
  return [client.firstName?.trim(), client.lastName?.trim()]
    .filter(Boolean)
    .join(" ");
}
