import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  AutomationActionType,
  AutomationOrigin,
  AutomationSourceType,
  OrderDeliveryStatus,
  OrderPaymentStatus,
  OrderStatus,
  OrderStatusAutomation,
  OrderStatusAutomationCondition,
  OrderStatusCategory,
} from "../database/entities";

export const AUTOMATION_TEMPLATE_KEYS = {
  DELIVERY_DELIVERED_TO_COMPLETED: "delivery.delivered_to_completed",
  PAYMENT_PAID_TO_CONFIRMED: "payment.paid_to_confirmed",
} as const;

@Injectable()
export class OrderStatusAutomationDefaultsService {
  constructor(
    @InjectRepository(OrderStatusAutomation)
    private readonly automationRepo: Repository<OrderStatusAutomation>,
    @InjectRepository(OrderStatusAutomationCondition)
    private readonly conditionRepo: Repository<OrderStatusAutomationCondition>,
    @InjectRepository(OrderStatus)
    private readonly orderStatusRepo: Repository<OrderStatus>,
  ) {}

  async createRecommendedDeliveryAutomations(
    workspaceId: number,
  ): Promise<void> {
    const completedId = await this.findSystemStatusId(
      workspaceId,
      OrderStatusCategory.completed,
    );

    if (completedId != null) {
      await this.createTemplateIfMissing({
        workspaceId,
        templateKey: AUTOMATION_TEMPLATE_KEYS.DELIVERY_DELIVERED_TO_COMPLETED,
        name: "Завершити отримане замовлення",
        conditions: [
          {
            sourceType: AutomationSourceType.delivery_status,
            sourceStatus: OrderDeliveryStatus.delivered,
          },
        ],
        targetOrderStatusId: completedId,
        isActive: false,
      });
    }
  }

  async createRecommendedPaymentAutomations(
    workspaceId: number,
  ): Promise<void> {
    const confirmedId = await this.findSystemStatusId(
      workspaceId,
      OrderStatusCategory.confirmed,
    );
    if (confirmedId == null) {
      return;
    }

    await this.createTemplateIfMissing({
      workspaceId,
      templateKey: AUTOMATION_TEMPLATE_KEYS.PAYMENT_PAID_TO_CONFIRMED,
      name: "Підтвердити оплачене замовлення",
      conditions: [
        {
          sourceType: AutomationSourceType.payment_status,
          sourceStatus: OrderPaymentStatus.paid,
        },
      ],
      targetOrderStatusId: confirmedId,
      isActive: false,
    });
  }

  private async findSystemStatusId(
    workspaceId: number,
    category: OrderStatusCategory,
  ): Promise<number | null> {
    const row = await this.orderStatusRepo.findOne({
      where: { workspaceId, category, isSystem: true },
      order: { sortOrder: "ASC", id: "ASC" },
    });
    return row?.id ?? null;
  }

  private async createTemplateIfMissing(input: {
    workspaceId: number;
    templateKey: string;
    name: string;
    conditions: Array<{
      sourceType: AutomationSourceType;
      sourceStatus: string;
    }>;
    targetOrderStatusId: number;
    isActive: boolean;
  }): Promise<void> {
    const existing = await this.automationRepo.findOne({
      where: {
        workspaceId: input.workspaceId,
        templateKey: input.templateKey,
      },
    });
    if (existing) {
      return;
    }

    const saved = await this.automationRepo.save(
      this.automationRepo.create({
        workspaceId: input.workspaceId,
        name: input.name,
        isActive: input.isActive,
        durationValue: null,
        durationUnit: null,
        actionType: AutomationActionType.change_order_status,
        targetOrderStatusId: input.targetOrderStatusId,
        origin: AutomationOrigin.multisale_template,
        templateKey: input.templateKey,
      }),
    );

    await this.conditionRepo.save(
      input.conditions.map((condition, index) =>
        this.conditionRepo.create({
          automationId: saved.id,
          sourceType: condition.sourceType,
          sourceStatus: condition.sourceStatus,
          sortOrder: index,
        }),
      ),
    );
  }
}
