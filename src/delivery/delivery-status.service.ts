import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ROLE_SUPER_ADMIN } from "../auth/constants";
import {
  Order,
  OrderDeliveryInfo,
  OrderEvent,
  Workspace,
  WorkspaceMember,
  WorkspaceMemberStatus,
} from "../database/entities";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { DeliveryProvider } from "./delivery-provider.enum";
import {
  DEV_SIMULATOR_STATUS_LABELS,
  NORMALIZED_TO_ORDER_DELIVERY_STATUS,
} from "./delivery-status-mapping";
import type { DeliveryStatusUpdateResultDto } from "./dto/delivery-status-update-result.dto";
import { NormalizedDeliveryStatus } from "./normalized-delivery-status.enum";
import { OrderDeliveryStatusApplicationService } from "./order-delivery-status-application.service";

export type ProcessDeliveryStatusUpdateInput = {
  deliveryOrderId: number;
  provider: DeliveryProvider;
  normalizedStatus: NormalizedDeliveryStatus;
  rawStatusCode?: string;
  rawPayload?: Record<string, unknown>;
  actorUserId?: number | null;
};

const OrderEventType = {
  DELIVERY_UPDATED: "order.delivery_updated",
} as const;

@Injectable()
export class DeliveryStatusService {
  constructor(
    @InjectRepository(OrderDeliveryInfo)
    private readonly deliveryRepo: Repository<OrderDeliveryInfo>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderEvent)
    private readonly orderEventRepo: Repository<OrderEvent>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly deliveryStatusApplication: OrderDeliveryStatusApplicationService,
  ) {}

  async processStatusUpdate(
    input: ProcessDeliveryStatusUpdateInput,
  ): Promise<DeliveryStatusUpdateResultDto> {
    const delivery = await this.deliveryRepo.findOne({
      where: { id: input.deliveryOrderId },
    });
    if (!delivery) {
      throw new NotFoundException("Delivery order not found");
    }

    const order = await this.orderRepo.findOne({
      where: { deliveryId: delivery.id },
      relations: { status: true },
    });

    const mappedDeliveryStatus =
      NORMALIZED_TO_ORDER_DELIVERY_STATUS[input.normalizedStatus];

    await this.deliveryStatusApplication.applyDeliveryStatusChange({
      delivery,
      newDeliveryStatus: mappedDeliveryStatus,
      providerStatusCode: input.rawStatusCode?.trim() || null,
      providerStatusText: this.resolveProviderStatusText(input) || null,
    });

    if (order && input.actorUserId != null) {
      await this.appendDeliveryEvent(
        order.workspaceId,
        order.id,
        input,
        delivery,
        order.statusId,
      );
    }

    const hydratedOrder = order
      ? await this.orderRepo.findOne({
          where: { workspaceId: order.workspaceId, id: order.id },
          relations: {
            items: true,
            status: true,
            customer: true,
            conversation: true,
            events: true,
          },
          order: { items: { id: "ASC" } },
        })
      : null;

    if (hydratedOrder?.events?.length) {
      hydratedOrder.events.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    }
    if (hydratedOrder) {
      hydratedOrder.deliveryInfo = delivery;
      this.stripCircularOrderRefs(hydratedOrder);
    }

    return {
      delivery,
      order: hydratedOrder,
      normalizedStatus: input.normalizedStatus,
    };
  }

  async requireSimulatorActor(
    userId: number,
    workspaceId: number,
    appRole?: string,
  ): Promise<Workspace> {
    const workspace = await this.workspaceContext.requireWorkspaceOwner(
      userId,
      workspaceId,
      appRole,
    );
    if (appRole === ROLE_SUPER_ADMIN || workspace.ownerId === userId) {
      return workspace;
    }

    const member = await this.memberRepo.findOne({
      where: {
        workspaceId,
        userId,
        status: WorkspaceMemberStatus.ACTIVE,
      },
      relations: { role: true },
    });
    const roleSlug = member?.role?.slug?.trim().toLowerCase() ?? "";
    if (roleSlug === "admin" || roleSlug === "administrator") {
      return workspace;
    }

    throw new ForbiddenException(
      "Only workspace owner or admin can use the delivery simulator",
    );
  }

  private resolveProviderStatusText(
    input: ProcessDeliveryStatusUpdateInput,
  ): string | null {
    const fromPayload = input.rawPayload?.statusText;
    if (typeof fromPayload === "string" && fromPayload.trim()) {
      return fromPayload.trim();
    }
    if (input.rawPayload?.source === "DEV_SIMULATOR") {
      return DEV_SIMULATOR_STATUS_LABELS[input.normalizedStatus];
    }
    const statusText = input.rawPayload?.statusText;
    if (typeof statusText === "string" && statusText.trim()) {
      return statusText.trim();
    }
    const trackingDocument = input.rawPayload?.trackingDocument;
    if (trackingDocument && typeof trackingDocument === "object") {
      const status = (trackingDocument as { Status?: string }).Status;
      if (typeof status === "string" && status.trim()) {
        return status.trim();
      }
    }
    return input.rawStatusCode?.trim() || null;
  }

  private async appendDeliveryEvent(
    workspaceId: number,
    orderId: number,
    input: ProcessDeliveryStatusUpdateInput,
    delivery: OrderDeliveryInfo,
    orderStatusId: number,
  ): Promise<void> {
    if (input.actorUserId == null) {
      return;
    }
    await this.orderEventRepo.save(
      this.orderEventRepo.create({
        workspaceId,
        orderId,
        type: OrderEventType.DELIVERY_UPDATED,
        actorId: input.actorUserId,
        userId: input.actorUserId,
        payload: {
          deliveryInfoId: delivery.id,
          deliveryStatus: delivery.deliveryStatus,
          providerStatusCode: delivery.providerStatusCode,
          providerStatusText: delivery.providerStatusText,
          normalizedStatus: input.normalizedStatus,
          provider: input.provider,
          rawPayload: input.rawPayload ?? null,
          orderStatusId,
        },
      }),
    );
  }

  private stripCircularOrderRefs(order: Order): void {
    for (const item of order.items ?? []) {
      delete (item as unknown as { order?: unknown }).order;
    }
    for (const event of order.events ?? []) {
      delete (event as unknown as { order?: unknown }).order;
    }
  }
}
