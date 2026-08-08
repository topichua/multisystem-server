import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Order } from "../../../database/entities";
import { OrderStatusCategory } from "../../../database/entities/order-status-category.enum";
import type { AnalyticsFilterContext } from "../../types/analytics-filter-context";
import type { AnalyticsNewVsRepeatResult } from "../../types/analytics-clients.types";
import { calculateSharePercent } from "../../utils/analytics-percent.util";
import { roundAnalyticsMoney } from "../../utils/analytics-math.util";

@Injectable()
export class NewVsRepeatClientsCalculator {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async calculate(
    context: AnalyticsFilterContext,
  ): Promise<AnalyticsNewVsRepeatResult> {
    const range = context.ranges.current;
    const rows = await this.orderRepo.manager.query(
      `
      WITH lifetime AS (
        SELECT
          o.customer_id,
          MIN(o.created_at) AS first_order_at
        FROM orders o
        INNER JOIN order_statuses s ON s.id = o.status_id
        WHERE o.workspace_id = $1
          AND s.category <> $2
        GROUP BY o.customer_id
      ),
      period_orders AS (
        SELECT
          o.customer_id,
          o.total_amount
        FROM orders o
        INNER JOIN order_statuses s ON s.id = o.status_id
        WHERE o.workspace_id = $1
          AND s.category <> $2
          AND o.created_at >= $3
          AND o.created_at <= $4
      ),
      classified AS (
        SELECT
          po.customer_id,
          po.total_amount,
          CASE
            WHEN l.first_order_at >= $3 AND l.first_order_at <= $4 THEN 'new'
            ELSE 'repeat'
          END AS segment
        FROM period_orders po
        INNER JOIN lifetime l ON l.customer_id = po.customer_id
      )
      SELECT
        segment,
        COUNT(DISTINCT customer_id)::int AS clients,
        COALESCE(SUM(total_amount), 0) AS revenue
      FROM classified
      GROUP BY segment
      `,
      [
        context.workspaceId,
        OrderStatusCategory.canceled,
        range.from,
        range.to,
      ],
    );

    const byKey = new Map<string, { clients: number; revenue: number }>();
    for (const row of rows as Array<{
      segment: string;
      clients: string | number;
      revenue: string | number;
    }>) {
      byKey.set(row.segment, {
        clients: Number(row.clients ?? 0),
        revenue: roundAnalyticsMoney(Number(row.revenue ?? 0)),
      });
    }

    const newSeg = byKey.get("new") ?? { clients: 0, revenue: 0 };
    const repeatSeg = byKey.get("repeat") ?? { clients: 0, revenue: 0 };
    const totalRevenue = roundAnalyticsMoney(newSeg.revenue + repeatSeg.revenue);

    return {
      currency: context.currency,
      totalRevenue,
      segments: [
        {
          key: "new",
          clients: newSeg.clients,
          revenue: newSeg.revenue,
          revenuePercent: calculateSharePercent(newSeg.revenue, totalRevenue),
        },
        {
          key: "repeat",
          clients: repeatSeg.clients,
          revenue: repeatSeg.revenue,
          revenuePercent: calculateSharePercent(
            repeatSeg.revenue,
            totalRevenue,
          ),
        },
      ],
    };
  }
}
