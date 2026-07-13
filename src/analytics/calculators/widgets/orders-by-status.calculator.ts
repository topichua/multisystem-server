import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Order, OrderStatus } from "../../../database/entities";
import type { AnalyticsFilterContext } from "../../types/analytics-filter-context";
import type { AnalyticsOrdersByStatusResult } from "../../types/analytics-overview-widgets.types";
import type { AnalyticsMetricCalculator } from "../analytics-metric-calculator.interface";
import { applyAnalyticsPeriodScope } from "../../utils/analytics-order-query.util";
import { calculateSharePercent } from "../../utils/analytics-percent.util";

type StatusCountRow = {
  statusId: string | number;
  count: string | number;
};

@Injectable()
export class OrdersByStatusCalculator implements AnalyticsMetricCalculator<AnalyticsOrdersByStatusResult> {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderStatus)
    private readonly orderStatusRepo: Repository<OrderStatus>,
  ) {}

  async calculate(
    context: AnalyticsFilterContext,
  ): Promise<AnalyticsOrdersByStatusResult> {
    const statuses = await this.orderStatusRepo.find({
      where: { workspaceId: context.workspaceId },
      order: { sortOrder: "ASC", id: "ASC" },
    });

    const qb = this.orderRepo.createQueryBuilder("o");
    applyAnalyticsPeriodScope(qb, "o", context);

    const counts = await qb
      .select("o.statusId", "statusId")
      .addSelect("COUNT(o.id)::int", "count")
      .groupBy("o.statusId")
      .getRawMany<StatusCountRow>();

    const countByStatusId = new Map(
      counts.map((row) => [Number(row.statusId), Number(row.count ?? 0)]),
    );
    const totalOrders = [...countByStatusId.values()].reduce(
      (sum, count) => sum + count,
      0,
    );

    return {
      statuses: statuses.map((status) => {
        const count = countByStatusId.get(status.id) ?? 0;
        return {
          statusId: status.id,
          name: status.name,
          color: status.color,
          count,
          percent: calculateSharePercent(count, totalOrders),
        };
      }),
    };
  }
}
