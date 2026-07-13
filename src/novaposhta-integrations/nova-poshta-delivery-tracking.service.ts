import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DeliveryProvider } from "../delivery/delivery-provider.enum";
import { DeliveryStatusService } from "../delivery/delivery-status.service";
import type { DeliveryStatusUpdateResultDto } from "../delivery/dto/delivery-status-update-result.dto";
import { NormalizedDeliveryStatus } from "../delivery/normalized-delivery-status.enum";
import {
  NovaPoshtaIntegration,
  Order,
  OrderDeliveryInfo,
  OrderDeliveryProvider,
} from "../database/entities";
import { NovaPoshtaApiService } from "./novaposhta-api.service";
import {
  buildSimulatedNovaPoshtaTrackingDocument,
  mapNovaPoshtaStatusCodeToNormalized,
  type NovaPoshtaTrackingDocument,
} from "./nova-poshta-status-code.mapping";

type TrackingApplySource = "NOVA_POSHTA_API" | "DEV_SIMULATOR";

@Injectable()
export class NovaPoshtaDeliveryTrackingService {
  constructor(
    @InjectRepository(OrderDeliveryInfo)
    private readonly deliveryRepo: Repository<OrderDeliveryInfo>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(NovaPoshtaIntegration)
    private readonly integrationRepo: Repository<NovaPoshtaIntegration>,
    private readonly novaPoshtaApi: NovaPoshtaApiService,
    private readonly deliveryStatus: DeliveryStatusService,
  ) {}

  /** Production + dev: pull current status from Nova Poshta API. */
  async syncFromNovaPoshta(
    deliveryOrderId: number,
    actorUserId?: number | null,
  ): Promise<DeliveryStatusUpdateResultDto> {
    const { delivery, integration } =
      await this.loadNovaPoshtaDeliveryContext(deliveryOrderId);

    const doc = await this.fetchTrackingDocument(
      integration.apiKey,
      delivery.trackingNumber!,
      delivery.phone!,
    );

    return this.applyTrackingDocument(
      deliveryOrderId,
      doc,
      "NOVA_POSHTA_API",
      actorUserId,
    );
  }

  async lookupTrackingDocument(input: {
    workspaceId: number;
    trackingNumber: string;
    phone: string;
    providerId?: number | null;
  }): Promise<NovaPoshtaTrackingDocument> {
    const integration = await this.resolveIntegrationForWorkspace(
      input.workspaceId,
      input.providerId ?? null,
    );
    return this.fetchTrackingDocument(
      integration.apiKey,
      input.trackingNumber,
      input.phone,
    );
  }

  private async fetchTrackingDocument(
    apiKey: string,
    trackingNumber: string,
    phone: string,
  ): Promise<NovaPoshtaTrackingDocument> {
    const ttn = trackingNumber.trim();
    if (!ttn) {
      throw new BadRequestException(
        "Delivery has no tracking number — create a TTN first",
      );
    }
    const normalizedPhone = phone.trim();
    if (!normalizedPhone) {
      throw new BadRequestException(
        "Delivery phone is required for Nova Poshta tracking",
      );
    }

    return this.novaPoshtaApi.getTrackingStatusDocument(
      apiKey,
      ttn,
      normalizedPhone,
    );
  }

  /**
   * Dev: apply a normalized step using Nova Poshta StatusCode/Status shape
   * (same parser as `syncFromNovaPoshta`).
   */
  async simulateNovaPoshtaStatus(
    deliveryOrderId: number,
    normalizedStatus: NormalizedDeliveryStatus,
    actorUserId?: number | null,
  ): Promise<DeliveryStatusUpdateResultDto> {
    const { delivery } =
      await this.loadNovaPoshtaDeliveryContext(deliveryOrderId);

    const trackingNumber = delivery.trackingNumber?.trim();
    if (
      normalizedStatus !== NormalizedDeliveryStatus.CREATED &&
      !trackingNumber
    ) {
      throw new BadRequestException(
        "Tracking number is required to simulate Nova Poshta statuses after CREATED",
      );
    }

    const doc = buildSimulatedNovaPoshtaTrackingDocument(
      trackingNumber ?? "00000000000000",
      normalizedStatus,
    );

    return this.applyTrackingDocument(
      deliveryOrderId,
      doc,
      "DEV_SIMULATOR",
      actorUserId,
    );
  }

  /** Shared handler for real NP polling, webhooks, and dev simulation. */
  async applyTrackingDocument(
    deliveryOrderId: number,
    doc: NovaPoshtaTrackingDocument,
    source: TrackingApplySource,
    actorUserId?: number | null,
  ): Promise<DeliveryStatusUpdateResultDto> {
    const normalizedStatus = mapNovaPoshtaStatusCodeToNormalized(
      doc.StatusCode,
    );
    if (!normalizedStatus) {
      throw new BadRequestException(
        `Unsupported Nova Poshta StatusCode: ${doc.StatusCode ?? "(empty)"}`,
      );
    }

    return this.deliveryStatus.processStatusUpdate({
      deliveryOrderId,
      provider: DeliveryProvider.NOVA_POSHTA,
      normalizedStatus,
      rawStatusCode: String(doc.StatusCode ?? "").trim(),
      rawPayload: {
        source,
        statusText: doc.Status ?? null,
        trackingDocument: doc,
      },
      actorUserId,
    });
  }

  private async loadNovaPoshtaDeliveryContext(
    deliveryOrderId: number,
  ): Promise<{
    delivery: OrderDeliveryInfo;
    integration: NovaPoshtaIntegration;
    order: Order | null;
  }> {
    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryOrderId },
    });
    if (!delivery) {
      throw new NotFoundException("Delivery order not found");
    }
    if (delivery.provider !== OrderDeliveryProvider.nova_poshta) {
      throw new BadRequestException("Delivery provider is not Nova Poshta");
    }

    const order = await this.orderRepo.findOne({
      where: { deliveryId: delivery.id },
    });

    const workspaceId = order?.workspaceId;
    if (workspaceId == null) {
      throw new BadRequestException("No order linked to this delivery");
    }

    const integration = await this.resolveIntegration(delivery, workspaceId);
    return { delivery, integration, order };
  }

  private async resolveIntegrationForWorkspace(
    workspaceId: number,
    providerId: number | null,
  ): Promise<NovaPoshtaIntegration> {
    if (providerId != null) {
      const row = await this.integrationRepo.findOne({
        where: { id: providerId, workspaceId },
      });
      if (!row) {
        throw new BadRequestException(
          "Nova Poshta integration not found for providerId",
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
    return row;
  }

  private async resolveIntegration(
    delivery: OrderDeliveryInfo,
    workspaceId: number,
  ): Promise<NovaPoshtaIntegration> {
    return this.resolveIntegrationForWorkspace(
      workspaceId,
      delivery.providerId,
    );
  }
}
