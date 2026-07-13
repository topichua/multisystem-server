import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Order,
  OrderEvent,
  OrderStatus,
  OrderStatusCategory,
} from "../database/entities";
import { InventoryService } from "../inventory/inventory.service";

export const OrderStatusChangeSource = {
  MANUAL: "MANUAL",
  AUTOMATION: "AUTOMATION",
  CONFIRM: "CONFIRM",
} as const;

export type OrderStatusChangeSourceCode =
  (typeof OrderStatusChangeSource)[keyof typeof OrderStatusChangeSource];

export type OrderStatusChangeAutomationMeta = {
  automationId: number;
  automationName: string;
  sourceType: string;
  sourceStatus: string;
  durationValue: number | null;
  durationUnit: string | null;
};

export type ChangeOrderStatusInput = {
  workspaceId: number;
  orderId: number;
  targetStatusId: number;
  actorId: number | null;
  changeSource: OrderStatusChangeSourceCode;
  automation?: OrderStatusChangeAutomationMeta;
};

export type ChangeOrderStatusResult = {
  applied: boolean;
  previousStatusId: number;
  newStatusId: number;
  skippedReason?: string;
};

@Injectable()
export class OrderStatusTransitionService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderStatus)
    private readonly orderStatusRepo: Repository<OrderStatus>,
    @InjectRepository(OrderEvent)
    private readonly orderEventRepo: Repository<OrderEvent>,
    private readonly inventory: InventoryService,
  ) {}

  async changeOrderStatus(
    input: ChangeOrderStatusInput,
  ): Promise<ChangeOrderStatusResult> {
    const order = await this.orderRepo.findOne({
      where: { workspaceId: input.workspaceId, id: input.orderId },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }

    if (order.statusId === input.targetStatusId) {
      return {
        applied: false,
        previousStatusId: order.statusId,
        newStatusId: order.statusId,
        skippedReason: "ORDER_ALREADY_IN_TARGET_STATUS",
      };
    }

    const newStatus = await this.orderStatusRepo.findOne({
      where: { id: input.targetStatusId, workspaceId: input.workspaceId },
    });
    if (!newStatus) {
      throw new BadRequestException(
        "Order status not found or not in workspace",
      );
    }

    const previousStatusId = order.statusId;
    const previousStatus = await this.orderStatusRepo.findOne({
      where: { id: previousStatusId, workspaceId: input.workspaceId },
    });

    order.statusId = newStatus.id;
    if (input.actorId != null) {
      order.updatedById = input.actorId;
    }
    await this.orderRepo.save(order);

    const payload: Record<string, unknown> = {
      previousStatusId,
      statusId: newStatus.id,
      statusName: newStatus.name,
      source: input.changeSource,
    };
    if (input.automation) {
      payload.automationId = input.automation.automationId;
      payload.automationName = input.automation.automationName;
      payload.automationSourceType = input.automation.sourceType;
      payload.automationSourceStatus = input.automation.sourceStatus;
      if (input.automation.durationValue != null) {
        payload.durationValue = input.automation.durationValue;
        payload.durationUnit = input.automation.durationUnit;
      }
    }

    await this.orderEventRepo.save(
      this.orderEventRepo.create({
        workspaceId: input.workspaceId,
        orderId: input.orderId,
        type: "order.status_changed",
        actorId: input.actorId,
        userId: input.actorId,
        payload,
      }),
    );

    await this.inventory.handleOrderInventoryForStatus(
      input.workspaceId,
      input.orderId,
      newStatus.category,
      input.actorId ?? 0,
      previousStatus?.category ?? null,
    );

    return {
      applied: true,
      previousStatusId,
      newStatusId: newStatus.id,
    };
  }

  async findStatusIdByCategory(
    workspaceId: number,
    category: OrderStatusCategory,
  ): Promise<number | null> {
    const row = await this.orderStatusRepo.findOne({
      where: { workspaceId, category, isSystem: true },
      order: { sortOrder: "ASC", id: "ASC" },
    });
    return row?.id ?? null;
  }
}
