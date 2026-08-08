import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Client, Order } from "../../../database/entities";
import { OrderStatusCategory } from "../../../database/entities/order-status-category.enum";
import type { AnalyticsFilterContext } from "../../types/analytics-filter-context";
import type { AnalyticsTopValuableClientsResult } from "../../types/analytics-clients.types";
import { AnalyticsTopValuableClientsSort } from "../../dto/analytics-clients-query.dto";
import { AnalyticsClientAvatarService } from "../../services/analytics-client-avatar.service";
import {
  ORDER_ITEM_GROSS_PROFIT_SQL,
  buildClientDisplayName,
} from "../../utils/analytics-clients-query.util";
import { roundAnalyticsMoney } from "../../utils/analytics-math.util";

const DEFAULT_LIMIT = 50;

type TopRow = {
  client_id: string | number;
  period_orders: string | number;
  period_revenue: string | number;
  lifetime_orders: string | number;
  lifetime_value: string | number;
  last_purchase_at: Date | string | null;
  period_gross_profit: string | number | null;
};

@Injectable()
export class TopValuableClientsCalculator {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly clientAvatars: AnalyticsClientAvatarService,
  ) {}

  async calculate(
    context: AnalyticsFilterContext,
    options?: {
      sort?: AnalyticsTopValuableClientsSort;
      limit?: number;
    },
  ): Promise<AnalyticsTopValuableClientsResult> {
    const sort =
      options?.sort ?? AnalyticsTopValuableClientsSort.lifetimeValue;
    const limit = Math.min(
      Math.max(options?.limit ?? DEFAULT_LIMIT, 1),
      DEFAULT_LIMIT,
    );
    const range = context.ranges.current;

    const orderBy = this.resolveOrderBy(sort);

    const rows = (await this.orderRepo.manager.query(
      `
      WITH lifetime AS (
        SELECT
          o.customer_id,
          COUNT(*)::int AS lifetime_orders,
          COALESCE(SUM(o.total_amount), 0) AS lifetime_value,
          MAX(o.created_at) AS last_purchase_at
        FROM orders o
        INNER JOIN order_statuses s ON s.id = o.status_id
        WHERE o.workspace_id = $1
          AND s.category <> $2
        GROUP BY o.customer_id
      ),
      period AS (
        SELECT
          o.customer_id,
          COUNT(*)::int AS period_orders,
          COALESCE(SUM(o.total_amount), 0) AS period_revenue
        FROM orders o
        INNER JOIN order_statuses s ON s.id = o.status_id
        WHERE o.workspace_id = $1
          AND s.category <> $2
          AND o.created_at >= $3
          AND o.created_at <= $4
        GROUP BY o.customer_id
      ),
      period_profit AS (
        SELECT
          o.customer_id,
          COALESCE(SUM(${ORDER_ITEM_GROSS_PROFIT_SQL}), 0) AS period_gross_profit
        FROM order_items oi
        INNER JOIN orders o
          ON o.workspace_id = oi.workspace_id
         AND o.id = oi.order_id
        INNER JOIN order_statuses s ON s.id = o.status_id
        WHERE o.workspace_id = $1
          AND s.category <> $2
          AND o.created_at >= $3
          AND o.created_at <= $4
        GROUP BY o.customer_id
      )
      SELECT
        l.customer_id AS client_id,
        COALESCE(p.period_orders, 0) AS period_orders,
        COALESCE(p.period_revenue, 0) AS period_revenue,
        l.lifetime_orders,
        l.lifetime_value,
        l.last_purchase_at,
        COALESCE(pp.period_gross_profit, 0) AS period_gross_profit
      FROM lifetime l
      LEFT JOIN period p ON p.customer_id = l.customer_id
      LEFT JOIN period_profit pp ON pp.customer_id = l.customer_id
      WHERE COALESCE(p.period_revenue, 0) > 0
         OR l.lifetime_orders > 0
      ORDER BY ${orderBy}
      LIMIT $5
      `,
      [
        context.workspaceId,
        OrderStatusCategory.canceled,
        range.from,
        range.to,
        limit,
      ],
    )) as TopRow[];

    const clientIds = rows.map((row) => Number(row.client_id));
    const [clients, avatarsByClientId] = await Promise.all([
      clientIds.length > 0
        ? this.clientRepo.find({
            where: {
              workspaceId: context.workspaceId,
              id: In(clientIds),
            },
          })
        : Promise.resolve([]),
      this.clientAvatars.resolveAvatarsByClientIds(
        context.workspaceId,
        clientIds,
      ),
    ]);
    const clientsById = new Map(clients.map((c) => [c.id, c]));

    return {
      currency: context.currency,
      customers: rows.map((row) => {
        const clientId = Number(row.client_id);
        const client = clientsById.get(clientId);
        const last =
          row.last_purchase_at == null
            ? null
            : row.last_purchase_at instanceof Date
              ? row.last_purchase_at.toISOString()
              : new Date(row.last_purchase_at).toISOString();
        return {
          clientId,
          name: client ? buildClientDisplayName(client) : "",
          avatar: avatarsByClientId.get(clientId) ?? null,
          orders: Number(row.lifetime_orders ?? 0),
          periodRevenue: roundAnalyticsMoney(Number(row.period_revenue ?? 0)),
          lastPurchaseAt: last,
          lifetimeValue: roundAnalyticsMoney(Number(row.lifetime_value ?? 0)),
          periodGrossProfit: roundAnalyticsMoney(
            Number(row.period_gross_profit ?? 0),
          ),
        };
      }),
    };
  }

  private resolveOrderBy(sort: AnalyticsTopValuableClientsSort): string {
    switch (sort) {
      case AnalyticsTopValuableClientsSort.periodRevenue:
        return "period_revenue DESC, lifetime_value DESC, client_id ASC";
      case AnalyticsTopValuableClientsSort.orders:
        return "lifetime_orders DESC, lifetime_value DESC, client_id ASC";
      case AnalyticsTopValuableClientsSort.lastPurchase:
        return "last_purchase_at DESC NULLS LAST, lifetime_value DESC, client_id ASC";
      case AnalyticsTopValuableClientsSort.lifetimeValue:
      default:
        return "lifetime_value DESC, period_revenue DESC, client_id ASC";
    }
  }
}
