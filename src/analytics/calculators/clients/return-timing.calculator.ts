import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Order } from "../../../database/entities";
import { OrderStatusCategory } from "../../../database/entities/order-status-category.enum";
import type { AnalyticsFilterContext } from "../../types/analytics-filter-context";
import type { AnalyticsReturnTimingResult } from "../../types/analytics-clients.types";
import { calculateSharePercent } from "../../utils/analytics-percent.util";

@Injectable()
export class ReturnTimingCalculator {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async calculate(
    context: AnalyticsFilterContext,
  ): Promise<AnalyticsReturnTimingResult> {
    const rows = await this.orderRepo.manager.query(
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
      ),
      bucketed AS (
        SELECT
          CASE
            WHEN days <= 7 THEN 'd0_7'
            WHEN days <= 30 THEN 'd8_30'
            WHEN days <= 60 THEN 'd31_60'
            WHEN days <= 90 THEN 'd61_90'
            ELSE 'd90_plus'
          END AS bucket
        FROM gaps
      )
      SELECT bucket, COUNT(*)::int AS clients
      FROM bucketed
      GROUP BY bucket
      `,
      [context.workspaceId, OrderStatusCategory.canceled],
    );

    const counts = new Map<string, number>();
    let total = 0;
    for (const row of rows as Array<{ bucket: string; clients: string | number }>) {
      const n = Number(row.clients ?? 0);
      counts.set(row.bucket, n);
      total += n;
    }

    const keys = [
      "d0_7",
      "d8_30",
      "d31_60",
      "d61_90",
      "d90_plus",
    ] as const;

    return {
      buckets: keys.map((key) => {
        const clients = counts.get(key) ?? 0;
        return {
          key,
          clients,
          percent: calculateSharePercent(clients, total),
        };
      }),
    };
  }
}
