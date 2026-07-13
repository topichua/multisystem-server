import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Client, Order } from "../../../database/entities";
import type { AnalyticsFilterContext } from "../../types/analytics-filter-context";
import type { AnalyticsTopCustomersResult } from "../../types/analytics-overview-widgets.types";
import type { AnalyticsMetricCalculator } from "../analytics-metric-calculator.interface";
import { AnalyticsClientAvatarService } from "../../services/analytics-client-avatar.service";
import { applyAnalyticsSuccessfulOrderScope } from "../../utils/analytics-order-query.util";
import { roundAnalyticsMoney } from "../../utils/analytics-math.util";

const TOP_CUSTOMERS_LIMIT = 10;

type TopCustomerRow = {
  clientId: string | number;
  orders: string | number;
  spent: string | number;
};

@Injectable()
export class TopCustomersCalculator implements AnalyticsMetricCalculator<AnalyticsTopCustomersResult> {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly clientAvatars: AnalyticsClientAvatarService,
  ) {}

  async calculate(
    context: AnalyticsFilterContext,
  ): Promise<AnalyticsTopCustomersResult> {
    const qb = this.orderRepo.createQueryBuilder("o");
    applyAnalyticsSuccessfulOrderScope(qb, "o", context);

    const rows = await qb
      .select("o.customerId", "clientId")
      .addSelect("COUNT(o.id)::int", "orders")
      .addSelect("COALESCE(SUM(o.totalAmount), 0)", "spent")
      .groupBy("o.customerId")
      .orderBy("spent", "DESC")
      .addOrderBy("orders", "DESC")
      .addOrderBy("o.customerId", "ASC")
      .limit(TOP_CUSTOMERS_LIMIT)
      .getRawMany<TopCustomerRow>();

    const clientIds = rows.map((row) => Number(row.clientId));
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

    const clientsById = new Map(clients.map((client) => [client.id, client]));

    return {
      customers: rows.map((row) => {
        const clientId = Number(row.clientId);
        const client = clientsById.get(clientId);
        return {
          clientId,
          name: buildClientName(client),
          avatar: avatarsByClientId.get(clientId) ?? null,
          orders: Number(row.orders ?? 0),
          spent: roundAnalyticsMoney(Number(row.spent ?? 0)),
        };
      }),
    };
  }
}

function buildClientName(client: Client | undefined): string {
  if (!client) {
    return "";
  }
  return [client.firstName?.trim(), client.lastName?.trim()]
    .filter(Boolean)
    .join(" ");
}
