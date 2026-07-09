import type { ObjectLiteral, SelectQueryBuilder } from "typeorm";
import { OrderStatusCategory } from "../../database/entities/order-status-category.enum";
import type { AnalyticsFilterContext } from "../types/analytics-filter-context";
import type { AnalyticsDateRange } from "../types/analytics-date-range.types";

export function applyAnalyticsOrderExclusions(
  qb: SelectQueryBuilder<ObjectLiteral>,
  orderAlias: string,
  statusAlias = "analyticsOrderStatus",
): SelectQueryBuilder<ObjectLiteral> {
  return qb
    .leftJoin(`${orderAlias}.status`, statusAlias)
    .andWhere(`${statusAlias}.category != :analyticsCanceledCategory`, {
      analyticsCanceledCategory: OrderStatusCategory.canceled,
    });
}

export function applyAnalyticsOrderRange(
  qb: SelectQueryBuilder<ObjectLiteral>,
  orderAlias: string,
  range: AnalyticsDateRange,
): void {
  qb.andWhere(`${orderAlias}.createdAt >= :analyticsFrom`, {
    analyticsFrom: range.from,
  }).andWhere(`${orderAlias}.createdAt <= :analyticsTo`, {
    analyticsTo: range.to,
  });
}

export function applyAnalyticsWorkspaceScope(
  qb: SelectQueryBuilder<ObjectLiteral>,
  orderAlias: string,
  context: AnalyticsFilterContext,
): void {
  qb.andWhere(`${orderAlias}.workspaceId = :analyticsWorkspaceId`, {
    analyticsWorkspaceId: context.workspaceId,
  });
}

export function applyReservedAnalyticsFilters(
  _qb: SelectQueryBuilder<ObjectLiteral>,
  _orderAlias: string,
  _context: AnalyticsFilterContext,
): void {
  // Reserved for future filters: channelIds, managerIds, orderStatusIds, etc.
}

export function applyAnalyticsPeriodScope(
  qb: SelectQueryBuilder<ObjectLiteral>,
  orderAlias: string,
  context: AnalyticsFilterContext,
): void {
  applyAnalyticsWorkspaceScope(qb, orderAlias, context);
  applyAnalyticsOrderRange(qb, orderAlias, context.ranges.current);
  applyReservedAnalyticsFilters(qb, orderAlias, context);
}

export function applyAnalyticsSuccessfulOrderScope(
  qb: SelectQueryBuilder<ObjectLiteral>,
  orderAlias: string,
  context: AnalyticsFilterContext,
  statusAlias = "analyticsOrderStatus",
): void {
  applyAnalyticsPeriodScope(qb, orderAlias, context);
  applyAnalyticsOrderExclusions(qb, orderAlias, statusAlias);
}
