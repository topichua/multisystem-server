import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Order } from "../../../database/entities";
import { OrderStatusCategory } from "../../../database/entities/order-status-category.enum";
import type { AnalyticsFilterContext } from "../../types/analytics-filter-context";
import type { AnalyticsRepeatFunnelResult } from "../../types/analytics-clients.types";
import { calculateSharePercent } from "../../utils/analytics-percent.util";

@Injectable()
export class RepeatPurchaseFunnelCalculator {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async calculate(
    context: AnalyticsFilterContext,
  ): Promise<AnalyticsRepeatFunnelResult> {
    const range = context.ranges.current;
    const rows = await this.orderRepo.manager.query(
      `
      WITH lifetime AS (
        SELECT o.customer_id, COUNT(*)::int AS order_count
        FROM orders o
        INNER JOIN order_statuses s ON s.id = o.status_id
        WHERE o.workspace_id = $1
          AND s.category <> $2
        GROUP BY o.customer_id
      ),
      active AS (
        SELECT DISTINCT o.customer_id
        FROM orders o
        INNER JOIN order_statuses s ON s.id = o.status_id
        WHERE o.workspace_id = $1
          AND s.category <> $2
          AND o.created_at >= $3
          AND o.created_at <= $4
      ),
      base AS (
        SELECT l.order_count
        FROM active a
        INNER JOIN lifetime l ON l.customer_id = a.customer_id
      )
      SELECT
        COUNT(*) FILTER (WHERE order_count >= 1)::int AS c1,
        COUNT(*) FILTER (WHERE order_count >= 2)::int AS c2,
        COUNT(*) FILTER (WHERE order_count >= 3)::int AS c3,
        COUNT(*) FILTER (WHERE order_count >= 4)::int AS c4
      FROM base
      `,
      [
        context.workspaceId,
        OrderStatusCategory.canceled,
        range.from,
        range.to,
      ],
    );

    const c1 = Number(rows?.[0]?.c1 ?? 0);
    const c2 = Number(rows?.[0]?.c2 ?? 0);
    const c3 = Number(rows?.[0]?.c3 ?? 0);
    const c4 = Number(rows?.[0]?.c4 ?? 0);

    return {
      steps: [
        {
          key: "orders_1_plus",
          minOrders: 1,
          clients: c1,
          percent: calculateSharePercent(c1, c1),
        },
        {
          key: "orders_2_plus",
          minOrders: 2,
          clients: c2,
          percent: calculateSharePercent(c2, c1),
        },
        {
          key: "orders_3_plus",
          minOrders: 3,
          clients: c3,
          percent: calculateSharePercent(c3, c1),
        },
        {
          key: "orders_4_plus",
          minOrders: 4,
          clients: c4,
          percent: calculateSharePercent(c4, c1),
        },
      ],
    };
  }
}
