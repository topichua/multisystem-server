import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  NovaPoshtaIntegration,
  NovaPoshtaPayerType,
  NovaPoshtaPaymentMethod,
  NovaPoshtaSenderType,
  Order,
  OrderDeliveryDestinationType,
  OrderDeliveryInfo,
  OrderDeliveryProvider,
  OrderDeliveryStatus,
  OrderItem,
} from "../database/entities";
import { canRemoveDeliveryTracking } from "../delivery/delivery-tracking.util";
import { OrderDeliveryStatusApplicationService } from "../delivery/order-delivery-status-application.service";
import { NormalizedDeliveryStatus } from "../delivery/normalized-delivery-status.enum";
import { NovaPoshtaDeliveryTrackingService } from "./nova-poshta-delivery-tracking.service";
import { buildSimulatedNovaPoshtaTrackingDocument } from "./nova-poshta-status-code.mapping";
import { WorkspaceAccessContextService } from "../workspace-access/workspace-access-context.service";
import type { CreateNovaPoshtaWaybillRequestDto } from "./dto/create-novaposhta-waybill.dto";
import type { CreateNovaPoshtaWaybillResponseDto } from "./dto/create-novaposhta-waybill.dto";
import { NovaPoshtaApiService } from "./novaposhta-api.service";
import type {
  NovaPoshtaCreateWaybillInput,
  NovaPoshtaCreateWaybillResult,
  NovaPoshtaOptionsSeat,
} from "./novaposhta-api.types";

const DEFAULT_WEIGHT_GRAMS = 1000;
const DEFAULT_SEATS = 1;

@Injectable()
export class NovaPoshtaWaybillService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderDeliveryInfo)
    private readonly deliveryRepo: Repository<OrderDeliveryInfo>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(NovaPoshtaIntegration)
    private readonly integrationRepo: Repository<NovaPoshtaIntegration>,
    private readonly workspaceContext: WorkspaceAccessContextService,
    private readonly novaPoshtaApi: NovaPoshtaApiService,
    private readonly novaPoshtaTracking: NovaPoshtaDeliveryTrackingService,
    private readonly deliveryStatusApplication: OrderDeliveryStatusApplicationService,
  ) {}

  async createForOrder(
    ownerId: number,
    orderId: number,
    dto: CreateNovaPoshtaWaybillRequestDto = {},
  ): Promise<CreateNovaPoshtaWaybillResponseDto> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);

    const order = await this.orderRepo.findOne({
      where: { id: orderId, workspaceId: workspace.id },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }

    const delivery = await this.loadDeliveryForOrder(order);
    if (!delivery) {
      throw new BadRequestException(
        "Order has no delivery info — set delivery before creating a waybill",
      );
    }
    if (delivery.provider !== OrderDeliveryProvider.nova_poshta) {
      throw new BadRequestException(
        "Order delivery provider is not Nova Poshta",
      );
    }
    if (delivery.trackingNumber?.trim()) {
      throw new ConflictException(
        "Nova Poshta waybill already exists for this order",
      );
    }

    const integration = await this.resolveIntegration(workspace.id, delivery);
    this.assertSenderConfigured(integration);
    this.assertRecipientConfigured(delivery);

    const items = await this.orderItemRepo.find({
      where: { orderId: order.id },
      relations: { product: true },
    });
    if (items.length === 0) {
      throw new BadRequestException(
        "Order has no items — add items before creating a waybill",
      );
    }

    const input = this.buildWaybillInput(
      order,
      delivery,
      integration,
      items,
      dto,
      await this.novaPoshtaApi.resolveRecipientCityRef(
        integration.apiKey,
        delivery.cityRef!,
        delivery.warehouseRef!,
      ),
    );
    const created = await this.novaPoshtaApi.createInternetDocument(
      integration.apiKey,
      input,
    );

    delivery.trackingNumber = created.trackingNumber;
    delivery.providerDocumentRef = created.documentRef || null;
    await this.deliveryRepo.save(delivery);

    try {
      await this.novaPoshtaTracking.syncFromNovaPoshta(delivery.id, ownerId);
    } catch {
      const trackingDoc = buildSimulatedNovaPoshtaTrackingDocument(
        created.trackingNumber,
        NormalizedDeliveryStatus.CREATED,
      );
      await this.novaPoshtaTracking.applyTrackingDocument(
        delivery.id,
        trackingDoc,
        "NOVA_POSHTA_API",
        ownerId,
      );
    }

    return {
      orderId: order.id,
      trackingNumber: created.trackingNumber,
      documentRef: created.documentRef,
    };
  }

  async removeWaybillForOrder(
    ownerId: number,
    orderId: number,
  ): Promise<{ orderId: number; removedTrackingNumber: string }> {
    const workspace =
      await this.workspaceContext.requireWorkspaceForOwner(ownerId);

    const order = await this.orderRepo.findOne({
      where: { id: orderId, workspaceId: workspace.id },
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }

    const delivery = await this.loadDeliveryForOrder(order);
    if (!delivery) {
      throw new BadRequestException("Order has no delivery info");
    }
    if (delivery.provider !== OrderDeliveryProvider.nova_poshta) {
      throw new BadRequestException(
        "Order delivery provider is not Nova Poshta",
      );
    }
    if (!canRemoveDeliveryTracking(delivery)) {
      throw new ConflictException(
        "Nova Poshta TTN cannot be removed after the parcel has been shipped",
      );
    }

    const removedTrackingNumber = delivery.trackingNumber!.trim();
    const documentRef =
      delivery.providerDocumentRef?.trim() || removedTrackingNumber;
    const integration = await this.resolveIntegration(workspace.id, delivery);

    await this.novaPoshtaApi.deleteInternetDocument(
      integration.apiKey,
      documentRef,
    );

    delivery.trackingNumber = null;
    delivery.providerDocumentRef = null;
    delivery.providerStatusCode = null;
    delivery.providerStatusText = null;
    await this.deliveryStatusApplication.applyDeliveryStatusChange({
      delivery,
      newDeliveryStatus: OrderDeliveryStatus.pending,
      providerStatusCode: null,
      providerStatusText: null,
    });

    return { orderId: order.id, removedTrackingNumber };
  }

  private async resolveIntegration(
    workspaceId: number,
    delivery: OrderDeliveryInfo,
  ): Promise<NovaPoshtaIntegration> {
    if (delivery.providerId != null) {
      const row = await this.integrationRepo.findOne({
        where: { id: delivery.providerId, workspaceId },
      });
      if (!row) {
        throw new BadRequestException(
          "Nova Poshta integration not found for delivery.providerId",
        );
      }
      return row;
    }

    const row = await this.integrationRepo.findOne({
      where: { workspaceId },
      order: { id: "ASC" },
    });
    if (!row) {
      throw new BadRequestException(
        "Nova Poshta integration is not configured for this workspace",
      );
    }

    const count = await this.integrationRepo.count({ where: { workspaceId } });
    if (count > 1) {
      throw new BadRequestException(
        "Multiple Nova Poshta integrations exist — set delivery.providerId to choose which one to use",
      );
    }
    return row;
  }

  private assertSenderConfigured(integration: NovaPoshtaIntegration): void {
    if (!integration.senderRef?.trim()) {
      throw new BadRequestException(
        "Nova Poshta integration is missing sender_ref",
      );
    }
    if (!integration.senderContactRef?.trim()) {
      throw new BadRequestException(
        "Nova Poshta integration is missing sender_contact_ref",
      );
    }
    if (!integration.senderCityRef?.trim()) {
      throw new BadRequestException(
        "Nova Poshta integration is missing sender_city_ref",
      );
    }
    if (!integration.senderPhone?.trim()) {
      throw new BadRequestException(
        "Nova Poshta integration is missing sender_phone",
      );
    }

    const senderType = integration.senderType ?? NovaPoshtaSenderType.WAREHOUSE;
    if (
      senderType === NovaPoshtaSenderType.WAREHOUSE &&
      !integration.senderWarehouseRef?.trim()
    ) {
      throw new BadRequestException(
        "Nova Poshta integration is missing sender_warehouse_ref",
      );
    }
    if (
      senderType === NovaPoshtaSenderType.ADDRESS &&
      (!integration.senderStreetRef?.trim() ||
        !integration.senderBuilding?.trim())
    ) {
      throw new BadRequestException(
        "Nova Poshta integration address sender requires sender_street_ref and sender_building",
      );
    }
  }

  private assertRecipientConfigured(delivery: OrderDeliveryInfo): void {
    if (!delivery.recipientName?.trim()) {
      throw new BadRequestException("Delivery recipientName is required");
    }
    if (!delivery.phone?.trim()) {
      throw new BadRequestException("Delivery phone is required");
    }
    if (!delivery.cityRef?.trim()) {
      throw new BadRequestException("Delivery cityRef is required");
    }

    const deliveryType =
      delivery.deliveryType ?? OrderDeliveryDestinationType.WAREHOUSE;
    if (
      deliveryType === OrderDeliveryDestinationType.WAREHOUSE &&
      !delivery.warehouseRef?.trim()
    ) {
      throw new BadRequestException(
        "Delivery warehouseRef is required when deliveryType is warehouse",
      );
    }
    if (deliveryType === OrderDeliveryDestinationType.ADDRESS) {
      throw new BadRequestException(
        "Address delivery waybill is not supported yet — add streetRef to delivery first",
      );
    }
  }

  private buildWaybillInput(
    order: Order,
    delivery: OrderDeliveryInfo,
    integration: NovaPoshtaIntegration,
    items: OrderItem[],
    dto: CreateNovaPoshtaWaybillRequestDto,
    cityRecipient: string,
  ): NovaPoshtaCreateWaybillInput {
    const senderType = integration.senderType ?? NovaPoshtaSenderType.WAREHOUSE;
    const recipientType =
      delivery.deliveryType ?? OrderDeliveryDestinationType.WAREHOUSE;

    const weightGrams =
      dto.weightGrams ??
      this.calculateWeightGrams(items) ??
      DEFAULT_WEIGHT_GRAMS;
    const weightKg = Math.max(0.1, weightGrams / 1000);

    const description =
      dto.description?.trim() ||
      items
        .map((item) =>
          [item.productTitleSnapshot, item.variantTitleSnapshot]
            .filter(Boolean)
            .join(" — "),
        )
        .filter(Boolean)
        .join("; ")
        .slice(0, 512) ||
      "Goods";

    const cost = dto.declaredCost ?? Number(order.totalAmount) ?? 0;
    const seatsAmount = this.resolveSeatsAmount(dto);
    const optionsSeat = this.buildOptionsSeat(weightKg, seatsAmount);
    const payerType = this.mapPayerType(integration.payerType);
    const paymentMethod = this.resolvePaymentMethod(integration, payerType);

    return {
      payerType,
      paymentMethod,
      serviceType: this.resolveServiceType(senderType, recipientType),
      weight: weightKg.toFixed(3),
      seatsAmount: String(seatsAmount),
      optionsSeat,
      description,
      cost: String(Math.max(0, Math.round(cost))),
      citySender: integration.senderCityRef!.trim(),
      sender: integration.senderRef!.trim(),
      senderAddress: this.resolveSenderAddress(integration, senderType),
      contactSender: integration.senderContactRef!.trim(),
      sendersPhone: this.normalizePhone(integration.senderPhone!),
      cityRecipient,
      recipientAddress: delivery.warehouseRef!.trim(),
      recipientName: delivery.recipientName!.trim(),
      recipientsPhone: this.normalizePhone(delivery.phone!),
    };
  }

  private resolveSeatsAmount(dto: CreateNovaPoshtaWaybillRequestDto): number {
    const seats = dto.seatsAmount ?? dto.seatsCount ?? DEFAULT_SEATS;
    return Math.max(1, Math.floor(seats));
  }

  private buildOptionsSeat(
    totalWeightKg: number,
    seatsAmount: number,
  ): NovaPoshtaOptionsSeat[] {
    const perSeatWeight = Math.max(0.1, totalWeightKg / seatsAmount);
    const weight = perSeatWeight.toFixed(3);
    return Array.from({ length: seatsAmount }, () => ({
      weight,
      volumetricVolume: "0.0004",
    }));
  }

  private resolveSenderAddress(
    integration: NovaPoshtaIntegration,
    senderType: NovaPoshtaSenderType,
  ): string {
    if (senderType === NovaPoshtaSenderType.WAREHOUSE) {
      return integration.senderWarehouseRef!.trim();
    }
    return integration.senderStreetRef!.trim();
  }

  private resolveServiceType(
    senderType: NovaPoshtaSenderType,
    recipientType: OrderDeliveryDestinationType,
  ): NovaPoshtaCreateWaybillInput["serviceType"] {
    const sender =
      senderType === NovaPoshtaSenderType.WAREHOUSE ? "Warehouse" : "Doors";
    const recipient =
      recipientType === OrderDeliveryDestinationType.WAREHOUSE
        ? "Warehouse"
        : "Doors";
    return `${sender}${recipient}` as NovaPoshtaCreateWaybillInput["serviceType"];
  }

  private mapPayerType(
    payerType: NovaPoshtaPayerType | null,
  ): NovaPoshtaCreateWaybillInput["payerType"] {
    switch (payerType) {
      case NovaPoshtaPayerType.RECIPIENT:
        return "Recipient";
      case NovaPoshtaPayerType.THIRD_PERSON:
        return "ThirdPerson";
      case NovaPoshtaPayerType.SENDER:
      default:
        return "Sender";
    }
  }

  private resolvePaymentMethod(
    integration: NovaPoshtaIntegration,
    payerType: NovaPoshtaCreateWaybillInput["payerType"],
  ): NovaPoshtaCreateWaybillInput["paymentMethod"] {
    if (payerType === "Recipient") {
      return "Cash";
    }

    const stored = integration.paymentMethod?.trim().toLowerCase();
    if (stored === NovaPoshtaPaymentMethod.NON_CASH || stored === "noncash") {
      return "NonCash";
    }
    if (stored === NovaPoshtaPaymentMethod.CASH) {
      return "Cash";
    }

    return "Cash";
  }

  private calculateWeightGrams(items: OrderItem[]): number | null {
    let total = 0;
    let hasWeight = false;
    for (const item of items) {
      const grams = item.product?.weightGrams;
      if (grams != null && grams > 0) {
        hasWeight = true;
        total += grams * item.quantity;
      }
    }
    return hasWeight ? total : null;
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (digits.startsWith("380")) {
      return digits;
    }
    if (digits.startsWith("0")) {
      return `38${digits}`;
    }
    if (digits.length === 9) {
      return `380${digits}`;
    }
    return digits;
  }

  private async loadDeliveryForOrder(
    order: Order,
  ): Promise<OrderDeliveryInfo | null> {
    if (
      order.deliveryId == null ||
      order.deliveryType !== OrderDeliveryProvider.nova_poshta
    ) {
      return null;
    }
    return this.deliveryRepo.findOne({ where: { id: order.deliveryId } });
  }
}
