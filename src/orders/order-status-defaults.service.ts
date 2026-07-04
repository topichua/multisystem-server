import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  ORDER_STATUS_SYSTEM_DEFAULTS,
  OrderStatus,
} from "../database/entities";

@Injectable()
export class OrderStatusDefaultsService {
  constructor(
    @InjectRepository(OrderStatus)
    private readonly orderStatusRepo: Repository<OrderStatus>,
  ) {}

  /** Ensures all built-in statuses exist for the workspace (`isSystem: true`). */
  async ensureSystemStatuses(workspaceId: number): Promise<void> {
    for (const defaults of ORDER_STATUS_SYSTEM_DEFAULTS) {
      const existing = await this.orderStatusRepo.findOne({
        where: {
          workspaceId,
          category: defaults.category,
          isSystem: true,
        },
      });
      if (existing) {
        continue;
      }

      await this.orderStatusRepo.save(
        this.orderStatusRepo.create({
          workspaceId,
          name: defaults.name,
          category: defaults.category,
          color: defaults.color,
          sortOrder: defaults.sortOrder,
          isDefault: defaults.isDefault,
          isSystem: true,
        }),
      );
    }

    const hasDefault = await this.orderStatusRepo.exist({
      where: { workspaceId, isDefault: true },
    });
    if (!hasDefault) {
      const newStatus = await this.orderStatusRepo.findOne({
        where: {
          workspaceId,
          category: ORDER_STATUS_SYSTEM_DEFAULTS[0].category,
          isSystem: true,
        },
      });
      if (newStatus) {
        newStatus.isDefault = true;
        await this.orderStatusRepo.save(newStatus);
      }
    }
  }
}
