import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Order } from "../../../database/entities";
import { OrderStatusCategory } from "../../../database/entities/order-status-category.enum";
import type { AnalyticsFilterContext } from "../../types/analytics-filter-context";
import type { AnalyticsAcquisitionSourcesResult } from "../../types/analytics-clients.types";
import { resolveClientAcquisitionSourceLabel } from "../../utils/analytics-clients-query.util";
import { calculateSharePercent } from "../../utils/analytics-percent.util";

@Injectable()
export class ClientAcquisitionSourcesCalculator {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  async calculate(
    context: AnalyticsFilterContext,
  ): Promise<AnalyticsAcquisitionSourcesResult> {
    const range = context.ranges.current;
    const rows = await this.orderRepo.manager.query(
      `
      WITH first_orders AS (
        SELECT DISTINCT ON (o.customer_id)
          o.customer_id,
          o.source,
          o.created_at
        FROM orders o
        INNER JOIN order_statuses s ON s.id = o.status_id
        WHERE o.workspace_id = $1
          AND s.category <> $2
        ORDER BY o.customer_id, o.created_at ASC, o.id ASC
      )
      SELECT
        source,
        COUNT(*)::int AS clients
      FROM first_orders
      WHERE created_at >= $3
        AND created_at <= $4
      GROUP BY source
      ORDER BY clients DESC, source ASC
      `,
      [
        context.workspaceId,
        OrderStatusCategory.canceled,
        range.from,
        range.to,
      ],
    );

    const sources = (
      rows as Array<{ source: string; clients: string | number }>
    ).map((row) => ({
      source: String(row.source ?? ""),
      clients: Number(row.clients ?? 0),
    }));
    const totalNewClients = sources.reduce((sum, s) => sum + s.clients, 0);

    return {
      totalNewClients,
      sources: sources.map((row) => ({
        source: row.source,
        name: resolveClientAcquisitionSourceLabel(row.source),
        clients: row.clients,
        percent: calculateSharePercent(row.clients, totalNewClients),
      })),
    };
  }
}
