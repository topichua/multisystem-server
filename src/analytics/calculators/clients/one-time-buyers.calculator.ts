import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Order } from "../../../database/entities";
import { OrderStatusCategory } from "../../../database/entities/order-status-category.enum";
import type { AnalyticsFilterContext } from "../../types/analytics-filter-context";
import type { AnalyticsOneTimeBuyersResult } from "../../types/analytics-clients.types";
import { calculateSharePercent } from "../../utils/analytics-percent.util";

@Injectable()
export class OneTimeBuyersCalculator {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async calculate(
    context: AnalyticsFilterContext,
  ): Promise<AnalyticsOneTimeBuyersResult> {
    const raw = await this.orderRepo.manager.query(
      `
      WITH lifetime AS (
        SELECT o.customer_id, COUNT(*)::int AS order_count
        FROM orders o
        INNER JOIN order_statuses s ON s.id = o.status_id
        WHERE o.workspace_id = $1
          AND s.category <> $2
        GROUP BY o.customer_id
      )
      SELECT
        COUNT(*) FILTER (WHERE order_count = 1)::int AS one_time,
        COUNT(*)::int AS base
      FROM lifetime
      `,
      [context.workspaceId, OrderStatusCategory.canceled],
    );

    const oneTime = Number(raw?.[0]?.one_time ?? 0);
    const base = Number(raw?.[0]?.base ?? 0);

    return {
      clients: oneTime,
      percentOfBase: calculateSharePercent(oneTime, base),
    };
  }
}
