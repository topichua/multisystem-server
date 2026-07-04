import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { DeliveryStatusService } from "../delivery/delivery-status.service";
import { DeliveryStatusUpdateResultDto } from "../delivery/dto/delivery-status-update-result.dto";
import { DevDeliverySimulatorGuard } from "../delivery/dev-delivery-simulator.guard";
import { NormalizedDeliveryStatus } from "../delivery/normalized-delivery-status.enum";
import { Order } from "../database/entities";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NovaPoshtaDeliveryTrackingService } from "./nova-poshta-delivery-tracking.service";

@ApiTags("dev-delivery-simulator")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard, DevDeliverySimulatorGuard)
@Controller("dev/delivery-orders")
export class DevDeliverySimulatorController {
  constructor(
    private readonly novaPoshtaTracking: NovaPoshtaDeliveryTrackingService,
    private readonly deliveryStatus: DeliveryStatusService,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  @Post(":id/sync-from-novaposhta")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "[Dev] Sync delivery status from Nova Poshta API",
    description:
      "Calls `TrackingDocument.getStatusDocuments` with the real TTN and recipient phone, " +
      "then applies the same status handler used in production.",
  })
  @ApiParam({ name: "id", description: "order_delivery_infos.id" })
  @ApiOkResponse({ type: DeliveryStatusUpdateResultDto })
  syncFromNovaPoshta(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<DeliveryStatusUpdateResultDto> {
    return this.run(req, id, (userId) =>
      this.novaPoshtaTracking.syncFromNovaPoshta(id, userId),
    );
  }

  @Post(":id/simulate-created")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "[Dev] Apply Nova Poshta StatusCode 1 (awaiting sender)",
  })
  @ApiParam({ name: "id", description: "order_delivery_infos.id" })
  @ApiOkResponse({ type: DeliveryStatusUpdateResultDto })
  simulateCreated(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<DeliveryStatusUpdateResultDto> {
    return this.simulate(req, id, NormalizedDeliveryStatus.CREATED);
  }

  @Post(":id/simulate-in-transit")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "[Dev] Apply Nova Poshta StatusCode 5 (in transit)",
  })
  @ApiParam({ name: "id", description: "order_delivery_infos.id" })
  @ApiOkResponse({ type: DeliveryStatusUpdateResultDto })
  simulateInTransit(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<DeliveryStatusUpdateResultDto> {
    return this.simulate(req, id, NormalizedDeliveryStatus.IN_TRANSIT);
  }

  @Post(":id/simulate-arrived")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "[Dev] Apply Nova Poshta StatusCode 7 (at branch)",
  })
  @ApiParam({ name: "id", description: "order_delivery_infos.id" })
  @ApiOkResponse({ type: DeliveryStatusUpdateResultDto })
  simulateArrived(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<DeliveryStatusUpdateResultDto> {
    return this.simulate(req, id, NormalizedDeliveryStatus.ARRIVED);
  }

  @Post(":id/simulate-delivered")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "[Dev] Apply Nova Poshta StatusCode 9 (received)",
  })
  @ApiParam({ name: "id", description: "order_delivery_infos.id" })
  @ApiOkResponse({ type: DeliveryStatusUpdateResultDto })
  simulateDelivered(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<DeliveryStatusUpdateResultDto> {
    return this.simulate(req, id, NormalizedDeliveryStatus.DELIVERED);
  }

  @Post(":id/simulate-returned")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "[Dev] Apply Nova Poshta StatusCode 106 (return)",
  })
  @ApiParam({ name: "id", description: "order_delivery_infos.id" })
  @ApiOkResponse({ type: DeliveryStatusUpdateResultDto })
  simulateReturned(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<DeliveryStatusUpdateResultDto> {
    return this.simulate(req, id, NormalizedDeliveryStatus.RETURNED);
  }

  @Post(":id/simulate-delivery-failed")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "[Dev] Apply Nova Poshta StatusCode 102 (recipient refused)",
  })
  @ApiParam({ name: "id", description: "order_delivery_infos.id" })
  @ApiOkResponse({ type: DeliveryStatusUpdateResultDto })
  simulateDeliveryFailed(
    @Req() req: { user?: AuthUser },
    @Param("id", ParseIntPipe) id: number,
  ): Promise<DeliveryStatusUpdateResultDto> {
    return this.simulate(req, id, NormalizedDeliveryStatus.DELIVERY_FAILED);
  }

  private simulate(
    req: { user?: AuthUser },
    deliveryOrderId: number,
    normalizedStatus: NormalizedDeliveryStatus,
  ): Promise<DeliveryStatusUpdateResultDto> {
    return this.run(req, deliveryOrderId, (userId) =>
      this.novaPoshtaTracking.simulateNovaPoshtaStatus(
        deliveryOrderId,
        normalizedStatus,
        userId,
      ),
    );
  }

  private async run(
    req: { user?: AuthUser },
    deliveryOrderId: number,
    action: (userId: number) => Promise<DeliveryStatusUpdateResultDto>,
  ): Promise<DeliveryStatusUpdateResultDto> {
    const userId = this.requireUserId(req);
    const sessionWorkspaceId = req.user?.workspaceId;
    if (sessionWorkspaceId == null) {
      throw new BadRequestException("workspaceId is required in JWT session");
    }

    const order = await this.orderRepo.findOne({
      where: { deliveryId: deliveryOrderId },
    });
    if (!order || order.workspaceId !== sessionWorkspaceId) {
      throw new BadRequestException(
        "Delivery order not found in current workspace",
      );
    }

    await this.deliveryStatus.requireSimulatorActor(
      userId,
      sessionWorkspaceId,
      req.user?.role,
    );

    return action(userId);
  }

  private requireUserId(req: { user?: AuthUser }): number {
    const userId = Number(req.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric user id",
      );
    }
    return userId;
  }
}
