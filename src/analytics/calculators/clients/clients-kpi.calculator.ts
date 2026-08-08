import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Order } from "../../../database/entities";
import { OrderStatusCategory } from "../../../database/entities/order-status-category.enum";
import type { AnalyticsFilterContext } from "../../types/analytics-filter-context";
import type { AnalyticsDateRange } from "../../types/analytics-date-range.types";
import type { AnalyticsClientsKpiResult } from "../../types/analytics-clients.types";
import {
  applyAnalyticsOrderExclusions,
  applyAnalyticsWorkspaceScope,
  applyReservedAnalyticsFilters,
} from "../../utils/analytics-order-query.util";
import {
  calculateChangePercent,
  roundAnalyticsMoney,
} from "../../utils/analytics-math.util";

type LifetimeAgg = {
  customers: string | number;
  revenue: string | number;
};

type PeriodAgg = {
  active_clients: string | number;
  order_count: string | number;
  multi_order_clients: string | number;
};

@Injectable()
export class ClientsKpiCalculator {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async calculate(
    context: AnalyticsFilterContext,
  ): Promise<AnalyticsClientsKpiResult> {
    const [
      currentPeriod,
      previousPeriod,
      currentNew,
      previousNew,
      lifetime,
      medianDays,
    ] = await Promise.all([
      this.loadPeriodAgg(context, context.ranges.current),
      this.loadPeriodAgg(context, context.ranges.previous),
      this.countNewClients(context, context.ranges.current),
      this.countNewClients(context, context.ranges.previous),
      this.loadLifetimeAgg(context),
      this.medianDaysToSecondPurchase(context),
    ]);

    const active = Number(currentPeriod.active_clients ?? 0);
    const prevActive = Number(previousPeriod.active_clients ?? 0);
    const orders = Number(currentPeriod.order_count ?? 0);
    const multi = Number(currentPeriod.multi_order_clients ?? 0);
    const prevOrders = Number(previousPeriod.order_count ?? 0);
    const prevMulti = Number(previousPeriod.multi_order_clients ?? 0);

    const ordersPerClient = this.ordersPerClient(orders, active);
    const previousOrdersPerClient = this.ordersPerClient(
      prevOrders,
      prevActive,
    );
    const repeatRate = this.repeatRate(multi, active);
    const previousRepeatRate = this.repeatRate(prevMulti, prevActive);

    const avgLtv =
      Number(lifetime.customers) > 0
        ? roundAnalyticsMoney(
            Number(lifetime.revenue) / Number(lifetime.customers),
          )
        : 0;

    return {
      activeClients: {
        value: active,
        changePercent: calculateChangePercent(active, prevActive),
        scope: "period",
      },
      newClients: {
        value: currentNew,
        changePercent: calculateChangePercent(currentNew, previousNew),
        scope: "period",
      },
      repeatPurchaseRate: {
        value: repeatRate,
        changePercent: calculateChangePercent(repeatRate, previousRepeatRate),
        scope: "period",
      },
      averageCustomerValue: {
        value: avgLtv,
        currency: context.currency,
        changePercent: null,
        scope: "lifetime",
      },
      ordersPerClient: {
        value: ordersPerClient,
        changePercent: calculateChangePercent(
          ordersPerClient,
          previousOrdersPerClient,
        ),
        scope: "period",
      },
      timeToRepurchaseDays: {
        value: medianDays == null ? 0 : medianDays,
        changePercent: null,
        scope: "lifetime",
      },
    };
  }

  private ordersPerClient(orders: number, clients: number): number {
    if (clients <= 0) {
      return 0;
    }
    return roundAnalyticsMoney(orders / clients);
  }

  private repeatRate(multiOrderClients: number, activeClients: number): number {
    if (activeClients <= 0) {
      return 0;
    }
    return roundAnalyticsMoney((multiOrderClients / activeClients) * 100);
  }

  private async loadPeriodAgg(
    context: AnalyticsFilterContext,
    range: AnalyticsDateRange,
  ): Promise<PeriodAgg> {
    const raw = await this.orderRepo.manager.query(
      `
      WITH period_orders AS (
        SELECT o.customer_id, o.id
        FROM orders o
        INNER JOIN order_statuses s ON s.id = o.status_id
        WHERE o.workspace_id = $1
          AND s.category <> $2
          AND o.created_at >= $3
          AND o.created_at <= $4
      ),
      lifetime AS (
        SELECT o.customer_id, COUNT(*)::int AS order_count
        FROM orders o
        INNER JOIN order_statuses s ON s.id = o.status_id
        WHERE o.workspace_id = $1
          AND s.category <> $2
        GROUP BY o.customer_id
      ),
      active AS (
        SELECT DISTINCT customer_id FROM period_orders
      )
      SELECT
        (SELECT COUNT(*)::int FROM active) AS active_clients,
        (SELECT COUNT(*)::int FROM period_orders) AS order_count,
        (
          SELECT COUNT(*)::int
          FROM active a
          INNER JOIN lifetime l ON l.customer_id = a.customer_id
          WHERE l.order_count >= 2
        ) AS multi_order_clients
      `,
      [
        context.workspaceId,
        OrderStatusCategory.canceled,
        range.from,
        range.to,
      ],
    );

    return (raw?.[0] ?? {
      active_clients: 0,
      order_count: 0,
      multi_order_clients: 0,
    }) as PeriodAgg;
  }

  private async loadLifetimeAgg(
    context: AnalyticsFilterContext,
  ): Promise<LifetimeAgg> {
    const raw = await this.orderRepo.manager.query(
      `
      SELECT
        COUNT(DISTINCT o.customer_id)::int AS customers,
        COALESCE(SUM(o.total_amount), 0) AS revenue
      FROM orders o
      INNER JOIN order_statuses s ON s.id = o.status_id
      WHERE o.workspace_id = $1
        AND s.category <> $2
      `,
      [context.workspaceId, OrderStatusCategory.canceled],
    );
    return (raw?.[0] ?? { customers: 0, revenue: 0 }) as LifetimeAgg;
  }

  private async countNewClients(
    context: AnalyticsFilterContext,
    range: AnalyticsDateRange,
  ): Promise<number> {
    const qb = this.orderRepo.createQueryBuilder("o");
    applyAnalyticsWorkspaceScope(qb, "o", context);
    applyAnalyticsOrderExclusions(qb, "o");
    applyReservedAnalyticsFilters(qb, "o", context);

    const rows = await qb
      .select("o.customerId", "customerId")
      .groupBy("o.customerId")
      .having("MIN(o.createdAt) >= :analyticsFrom", {
        analyticsFrom: range.from,
      })
      .andHaving("MIN(o.createdAt) <= :analyticsTo", {
        analyticsTo: range.to,
      })
      .getRawMany();

    return rows.length;
  }

  private async medianDaysToSecondPurchase(
    context: AnalyticsFilterContext,
  ): Promise<number | null> {
    const raw = await this.orderRepo.manager.query(
      `
      WITH ranked AS (
        SELECT
          o.customer_id,
          o.created_at,
          ROW_NUMBER() OVER (
            PARTITION BY o.customer_id
            ORDER BY o.created_at ASC, o.id ASC
          ) AS rn
        FROM orders o
        INNER JOIN order_statuses s ON s.id = o.status_id
        WHERE o.workspace_id = $1
          AND s.category <> $2
      ),
      gaps AS (
        SELECT
          EXTRACT(EPOCH FROM (second.created_at - first.created_at)) / 86400.0 AS days
        FROM ranked first
        INNER JOIN ranked second
          ON second.customer_id = first.customer_id
         AND first.rn = 1
         AND second.rn = 2
        WHERE second.created_at > first.created_at
      )
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days) AS median_days
      FROM gaps
      `,
      [context.workspaceId, OrderStatusCategory.canceled],
    );

    const median = raw?.[0]?.median_days;
    if (median == null || Number.isNaN(Number(median))) {
      return null;
    }
    return Math.round(Number(median));
  }
}
