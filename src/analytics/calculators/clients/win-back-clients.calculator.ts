import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Order } from "../../../database/entities";
import { OrderStatusCategory } from "../../../database/entities/order-status-category.enum";
import type { AnalyticsFilterContext } from "../../types/analytics-filter-context";
import type { AnalyticsWinBackResult } from "../../types/analytics-clients.types";

/**
 * Customers who have purchased before and are idle longer than their
 * typical inter-purchase cycle (or fixed windows when cycle unknown).
 *
 * Buckets by days since last purchase, only for clients considered overdue:
 * days_since_last >= GREATEST(COALESCE(avg_gap_days, 25), 25).
 */
@Injectable()
export class WinBackClientsCalculator {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async calculate(
    context: AnalyticsFilterContext,
  ): Promise<AnalyticsWinBackResult> {
    const rows = await this.orderRepo.manager.query(
      `
      WITH ordered AS (
        SELECT
          o.customer_id,
          o.created_at,
          LAG(o.created_at) OVER (
            PARTITION BY o.customer_id
            ORDER BY o.created_at ASC, o.id ASC
          ) AS prev_at
        FROM orders o
        INNER JOIN order_statuses s ON s.id = o.status_id
        WHERE o.workspace_id = $1
          AND s.category <> $2
      ),
      gaps AS (
        SELECT
          customer_id,
          EXTRACT(EPOCH FROM (created_at - prev_at)) / 86400.0 AS gap_days
        FROM ordered
        WHERE prev_at IS NOT NULL
      ),
      cycle AS (
        SELECT
          customer_id,
          AVG(gap_days) AS avg_gap_days
        FROM gaps
        GROUP BY customer_id
      ),
      last_purchase AS (
        SELECT
          o.customer_id,
          MAX(o.created_at) AS last_at,
          COUNT(*)::int AS order_count
        FROM orders o
        INNER JOIN order_statuses s ON s.id = o.status_id
        WHERE o.workspace_id = $1
          AND s.category <> $2
        GROUP BY o.customer_id
      ),
      candidates AS (
        SELECT
          lp.customer_id,
          EXTRACT(EPOCH FROM (NOW() - lp.last_at)) / 86400.0 AS days_since_last,
          COALESCE(c.avg_gap_days, 25) AS cycle_days
        FROM last_purchase lp
        LEFT JOIN cycle c ON c.customer_id = lp.customer_id
        WHERE lp.order_count >= 1
          AND EXTRACT(EPOCH FROM (NOW() - lp.last_at)) / 86400.0 >= 25
          AND EXTRACT(EPOCH FROM (NOW() - lp.last_at)) / 86400.0
            >= GREATEST(COALESCE(c.avg_gap_days, 25), 25)
      ),
      bucketed AS (
        SELECT
          CASE
            WHEN days_since_last <= 45 THEN 'd25_45'
            WHEN days_since_last <= 90 THEN 'd46_90'
            ELSE 'd90_plus'
          END AS bucket
        FROM candidates
      )
      SELECT bucket, COUNT(*)::int AS clients
      FROM bucketed
      GROUP BY bucket
      `,
      [context.workspaceId, OrderStatusCategory.canceled],
    );

    const counts = new Map<string, number>();
    for (const row of rows as Array<{ bucket: string; clients: string | number }>) {
      counts.set(row.bucket, Number(row.clients ?? 0));
    }

    const buckets = (
      [
        ["d25_45", counts.get("d25_45") ?? 0],
        ["d46_90", counts.get("d46_90") ?? 0],
        ["d90_plus", counts.get("d90_plus") ?? 0],
      ] as const
    ).map(([key, clients]) => ({ key, clients }));

    return {
      buckets,
      totalClients: buckets.reduce((sum, b) => sum + b.clients, 0),
    };
  }
}
