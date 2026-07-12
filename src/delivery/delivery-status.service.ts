import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ROLE_SUPER_ADMIN } from "../auth/constants";
import {
  NovaPoshtaIntegration,
  Order,
  OrderDeliveryInfo,
  OrderDeliveryProvider,
  OrderEvent,
  OrderStatus,
  Workspace,
  WorkspaceMember,
  WorkspaceMemberStatus,
} from "../database/entities";
import { InventoryService } from "../inventory/inventory.service";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import { DeliveryProvider } from "./delivery-provider.enum";
import {
  DEV_SIMULATOR_STATUS_LABELS,
  NORMALIZED_TO_ORDER_DELIVERY_STATUS,
} from "./delivery-status-mapping";
import type { DeliveryStatusUpdateResultDto } from "./dto/delivery-status-update-result.dto";
import { NormalizedDeliveryStatus } from "./normalized-delivery-status.enum";

export type ProcessDeliveryStatusUpdateInput = {
  deliveryOrderId: number;
  provider: DeliveryProvider;
  normalizedStatus: NormalizedDeliveryStatus;
  rawStatusCode?: string;
  rawPayload?: Record<string, unknown>;
  actorUserId?: number | null;
};

const OrderEventType = {
  STATUS_CHANGED: "order.status_changed",
  DELIVERY_UPDATED: "order.delivery_updated",
} as const;

@Injectable()
export class DeliveryStatusService {
  constructor(
    @InjectRepository(OrderDeliveryInfo)
    private readonly deliveryRepo: Repository<OrderDeliveryInfo>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(NovaPoshtaIntegration)
    private readonly novaPoshtaIntegrationRepo: Repository<NovaPoshtaIntegration>,
    @InjectRepository(OrderStatus)
    private readonly orderStatusRepo: Repository<OrderStatus>,
    @InjectRepository(OrderEvent)
    private readonly orderEventRepo: Repository<OrderEvent>,
    @InjectRepository(WorkspaceMember)
    private readonly memberRepo: Repository<WorkspaceMember>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly inventory: InventoryService,
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
    const previousDeliveryStatus = delivery.deliveryStatus;
    const previousProviderStatusCode = delivery.providerStatusCode;

    delivery.deliveryStatus = mappedDeliveryStatus;
    delivery.providerStatusCode = input.rawStatusCode?.trim() || null;
    delivery.providerStatusText =
      this.resolveProviderStatusText(input) || null;
    if (
      delivery.deliveryStatus !== previousDeliveryStatus ||
      delivery.providerStatusCode !== previousProviderStatusCode
    ) {
      delivery.deliveryStatusCodeAt = new Date();
    }
    await this.deliveryRepo.save(delivery);

    let appliedOrderStatusId: number | null = null;
    if (order && input.actorUserId != null) {
      await this.appendDeliveryEvent(
        order.workspaceId,
        order.id,
        input,
        delivery,
        order.statusId,
      );
    }

    if (order) {
      const mappedOrderStatusId = await this.resolveMappedOrderStatusId(
        delivery,
        order.workspaceId,
        input.provider,
        input.normalizedStatus,
      );
      if (mappedOrderStatusId != null && mappedOrderStatusId !== order.statusId) {
        const newStatus = await this.orderStatusRepo.findOne({
          where: { id: mappedOrderStatusId, workspaceId: order.workspaceId },
        });
        if (!newStatus) {
          throw new BadRequestException(
            "Mapped order status not found in workspace",
          );
        }
        const previousStatusId = order.statusId;
        const previousStatus = await this.orderStatusRepo.findOne({
          where: { id: previousStatusId, workspaceId: order.workspaceId },
        });
        order.statusId = newStatus.id;
        order.updatedById = input.actorUserId ?? null;
        await this.orderRepo.save(order);
        appliedOrderStatusId = newStatus.id;

        await this.orderEventRepo.save(
          this.orderEventRepo.create({
            workspaceId: order.workspaceId,
            orderId: order.id,
            type: OrderEventType.STATUS_CHANGED,
            actorId: input.actorUserId ?? null,
            userId: input.actorUserId ?? null,
            payload: {
              previousStatusId,
              statusId: newStatus.id,
              statusName: newStatus.name,
              source: "delivery_status_update",
              normalizedDeliveryStatus: input.normalizedStatus,
              provider: input.provider,
            },
          }),
        );
        await this.inventory.handleOrderInventoryForStatus(
          order.workspaceId,
          order.id,
          newStatus.category,
          input.actorUserId ?? 0,
          previousStatus?.category ?? null,
        );
      }
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
      appliedOrderStatusId,
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

  private async resolveMappedOrderStatusId(
    delivery: OrderDeliveryInfo,
    workspaceId: number,
    provider: DeliveryProvider,
    normalizedStatus: NormalizedDeliveryStatus,
  ): Promise<number | null> {
    if (provider !== DeliveryProvider.NOVA_POSHTA) {
      return null;
    }
    if (delivery.provider !== OrderDeliveryProvider.nova_poshta) {
      return null;
    }

    const integration = await this.resolveNovaPoshtaIntegration(
      delivery,
      workspaceId,
    );
    if (!integration) {
      return null;
    }

    switch (normalizedStatus) {
      case NormalizedDeliveryStatus.CREATED:
        return integration.onCreatedOrderStatusId;
      case NormalizedDeliveryStatus.IN_TRANSIT:
        return integration.onInTransitOrderStatusId;
      case NormalizedDeliveryStatus.ARRIVED:
        return integration.onArrivedOrderStatusId;
      case NormalizedDeliveryStatus.DELIVERED:
        return integration.onDeliveredOrderStatusId;
      case NormalizedDeliveryStatus.RETURNED:
        return integration.onReturnedOrderStatusId;
      case NormalizedDeliveryStatus.DELIVERY_FAILED:
        return integration.onDeliveryFailedOrderStatusId;
      default:
        return null;
    }
  }

  private async resolveNovaPoshtaIntegration(
    delivery: OrderDeliveryInfo,
    workspaceId: number,
  ): Promise<NovaPoshtaIntegration | null> {
    if (delivery.providerId != null) {
      return this.novaPoshtaIntegrationRepo.findOne({
        where: { id: delivery.providerId, workspaceId },
      });
    }
    return this.novaPoshtaIntegrationRepo.findOne({
      where: { workspaceId },
      order: { id: "ASC" },
    });
  }

  private async appendDeliveryEvent(
    workspaceId: number,
    orderId: number,
    input: ProcessDeliveryStatusUpdateInput,
    delivery: OrderDeliveryInfo,
    previousOrderStatusId: number,
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
          previousOrderStatusId,
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
