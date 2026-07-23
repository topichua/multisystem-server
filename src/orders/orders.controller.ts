import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { AddOrderItemDto } from "./dto/add-order-item.dto";
import { CreateOrderDto } from "./dto/create-order.dto";
import { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import { CreateOrderStatusDefinitionDto } from "./dto/create-order-status-definition.dto";
import { SetOrderStatusesOrderDto } from "./dto/set-order-statuses-order.dto";
import { OrderStatusResponseDto } from "./dto/order-status-response.dto";
import { UpdateOrderDeliveryDto } from "./dto/update-order-delivery.dto";
import { AddOrderDeliveryFromTrackingDto } from "./dto/add-order-delivery-from-tracking.dto";
import {
  CreateOrderDeliveryPaymentDto,
  CreateOrderDeliveryPaymentResponseDto,
} from "./dto/create-order-delivery-payment.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { UpdateOrderStatusDefinitionDto } from "./dto/update-order-status-definition.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { OrderEventsListResponseDto } from "./dto/order-events-list-response.dto";
import { CreateNovaPoshtaWaybillRequestDto } from "../novaposhta-integrations/dto/create-novaposhta-waybill.dto";
import { CreateNovaPoshtaWaybillResponseDto } from "../novaposhta-integrations/dto/create-novaposhta-waybill.dto";
import { DeliveryStatusUpdateResultDto } from "../delivery/dto/delivery-status-update-result.dto";
import {
  ChangeDeliveryStatusDto,
  ChangeDeliveryStatusResultDto,
} from "../delivery/dto/change-delivery-status.dto";
import { OrderPaymentSummaryResponseDto } from "../payments/dto/order-payment-summary-response.dto";
import { OrdersService } from "./orders.service";

@ApiTags("orders")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: "Create order",
    description:
      "Single request to create an order. Provide exactly one of `customerId` (existing client) or `customerNew` (creates a client without social links). " +
      "Status is always the workspace default (`order_statuses.is_default`); use PATCH /orders/:orderId/status to change it later. " +
      "Order `id` is per-workspace and starts at 1001 (1002, 1003, …). " +
      "Other optional fields: `conversationId` (sets `integrationId` from the chat's integration), `source`, `currency`, notes, `items`, `delivery`.",
  })
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: { user?: AuthUser }, @Body() dto: CreateOrderDto) {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.createOrder(ownerId, dto);
  }

  @Post(":orderId/items")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Add line item to order",
    description:
      "Allowed only while order status category is `new`. Prefer PATCH /orders/:orderId with `items` to replace the full list.",
  })
  async addItem(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Body() dto: AddOrderItemDto,
  ) {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.addOrderItem(ownerId, orderId, dto);
  }

  @Patch(":orderId")
  @ApiOperation({
    summary: "Update order",
    description:
      "Patch order fields. `items` replaces all line items (same shape as create) — " +
      "allowed only while order status category is `new`. Notes can be updated anytime.",
  })
  @ApiBody({ type: UpdateOrderDto })
  async updateOrder(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Body() dto: UpdateOrderDto,
  ) {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.updateOrder(ownerId, orderId, dto);
  }

  @Post(":orderId/confirm")
  @ApiOperation({
    summary: "Confirm order",
    description:
      "Sets order status to the workspace system status in category `confirmed` " +
      "(same inventory side effects as manual status change).",
  })
  async confirmOrder(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
  ) {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.confirmOrder(ownerId, orderId);
  }

  @Patch(":orderId/status")
  async updateStatus(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.updateOrderStatus(ownerId, orderId, dto);
  }

  @Patch(":orderId/delivery")
  async updateDelivery(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Body() dto: UpdateOrderDeliveryDto,
  ) {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.updateDeliveryInfo(ownerId, orderId, dto);
  }

  @Post(":orderId/delivery/tracking")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Sync delivery info from carrier tracking number",
    description:
      "Looks up a carrier tracking number and creates or replaces order delivery info. " +
      "When delivery info already exists, the previous record is removed and replaced with the lookup result. " +
      "The new delivery row is marked with `syncedFromTrackingManually: true`. " +
      "For Nova Poshta, calls `TrackingDocument.getStatusDocuments` and fills recipient, city, warehouse, warehouse ref, address parts, status, and tracking fields. " +
      "Phone defaults to the order customer phone when omitted.",
  })
  @ApiBody({ type: AddOrderDeliveryFromTrackingDto })
  @ApiParam({ name: "orderId", type: Number })
  @ApiCreatedResponse({ description: "Order with hydrated delivery info." })
  addDeliveryFromTracking(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Body() dto: AddOrderDeliveryFromTrackingDto,
  ) {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.addDeliveryFromTracking(ownerId, orderId, dto);
  }

  @Patch(":orderId/delivery/status")
  @ApiOperation({
    summary: "Change order delivery status",
    description:
      "Updates `deliveryStatus` for the order delivery record and triggers order status automations when the value changes.",
  })
  @ApiBody({ type: ChangeDeliveryStatusDto })
  @ApiParam({ name: "orderId", type: Number })
  @ApiOkResponse({ type: ChangeDeliveryStatusResultDto })
  changeDeliveryStatus(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Body() dto: ChangeDeliveryStatusDto,
  ): Promise<ChangeDeliveryStatusResultDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.changeOrderDeliveryStatus(ownerId, orderId, dto);
  }

  @Post(":orderId/delivery/payment")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create Nova Poshta COD payment for order delivery",
    description:
      "Creates a pending payment with type/source `nova_poshta_payment` and stores its id on `delivery_info.payment_id` " +
      "(nullable until created). Amount defaults to `cashOnDeliveryAmount`. " +
      "This payment cannot be approved via POST /orders/:orderId/payments/transactions/:id/confirm — " +
      "use `OrdersService.confirmDeliveryPaymentReceived` / `PaymentDomainService.confirmNovaPoshtaDeliveryPayment` when COD money is received.",
  })
  @ApiBody({ type: CreateOrderDeliveryPaymentDto, required: false })
  @ApiParam({ name: "orderId", type: Number })
  @ApiCreatedResponse({ type: CreateOrderDeliveryPaymentResponseDto })
  createDeliveryPayment(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Body() dto?: CreateOrderDeliveryPaymentDto,
  ): Promise<CreateOrderDeliveryPaymentResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.createDeliveryPayment(
      ownerId,
      orderId,
      dto ?? {},
      req.user?.role,
    );
  }

  @Post(":orderId/novaposhta/waybill")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create Nova Poshta TTN (waybill) for an order",
    description:
      "Recipient, COD, and address come from order `delivery_info`. Sender settings come from Nova Poshta integration. " +
      "Request body accepts optional parcel overrides: `default_weight_kg`, `default_width_cm`, `default_height_cm`, `default_length_cm`, `payer_type`, `seats_amount`. " +
      "Writes `trackingNumber` and sets `deliveryStatus` to `waybill_created`.",
  })
  @ApiParam({ name: "orderId", type: Number })
  @ApiCreatedResponse({ type: CreateNovaPoshtaWaybillResponseDto })
  async createNovaPoshtaWaybill(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Body() dto?: CreateNovaPoshtaWaybillRequestDto,
  ) {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.createNovaPoshtaWaybill(ownerId, orderId, dto ?? {});
  }

  @Delete(":orderId/novaposhta/waybill")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Delete Nova Poshta TTN (waybill) for an order",
    description:
      "Calls Nova Poshta InternetDocument.delete and clears tracking fields. " +
      "Only allowed while `deliveryInfo.canRemoveTracking` is true (before `shipped`).",
  })
  @ApiParam({ name: "orderId", type: Number })
  async removeNovaPoshtaWaybill(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
  ) {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.removeNovaPoshtaWaybill(ownerId, orderId);
  }

  @Post(":orderId/sync-delivery")
  @Post(":orderId/sync-delivry")
  @ApiOperation({
    summary: "Sync delivery status from provider",
    description:
      "Fetches the latest provider delivery status by tracking number and updates the order delivery info.",
  })
  @ApiOkResponse({ type: DeliveryStatusUpdateResultDto })
  @ApiParam({ name: "orderId", type: Number })
  async syncDelivery(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
  ): Promise<DeliveryStatusUpdateResultDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.syncDeliveryInfo(ownerId, orderId);
  }

  @Get()
  @ApiOperation({
    summary: "List orders",
    description:
      "Paginated orders for the workspace. Each item includes `createdBy` and a `payment` object with status, paid amount, remaining amount, and all financial transactions. " +
      "Payment fields are nested under `payment` rather than returned at the order root. Optional `clientId` limits to that customer; `statusId` filters by status. " +
      "`keyword` searches customer first/last name, phone, tracking number, and order number.",
  })
  async list(
    @Req() req: { user?: AuthUser },
    @Query() query: ListOrdersQueryDto,
  ) {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.listOrdersByWorkspace(ownerId, query);
  }

  @Get("statuses")
  @ApiOperation({
    summary: "List order statuses",
    description:
      "Available order statuses in your workspace (seeded system + custom), ordered by `sortOrder`. Use status `id` when creating or updating orders.",
  })
  @ApiOkResponse({ type: [OrderStatusResponseDto] })
  async listStatuses(
    @Req() req: { user?: AuthUser },
  ): Promise<OrderStatusResponseDto[]> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.listOrderStatusesForOwner(ownerId);
  }

  @Put("statuses/order")
  @ApiOperation({
    summary: "Set order status display order",
    description:
      "Reorders workspace statuses by `sortOrder`. Body `ids` must list every status id exactly once, in the desired sequence (first id → `sortOrder` 0).",
  })
  @ApiBody({ type: SetOrderStatusesOrderDto })
  @ApiOkResponse({ type: [OrderStatusResponseDto] })
  async setStatusesOrder(
    @Req() req: { user?: AuthUser },
    @Body() dto: SetOrderStatusesOrderDto,
  ): Promise<OrderStatusResponseDto[]> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.setOrderStatusesOrderForOwner(
      ownerId,
      dto,
      req.user?.role,
    );
  }

  @Post("statuses")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create custom order status",
    description:
      "Creates a custom status (`isSystem: false`) under an existing category/type. Appended after existing statuses by `sortOrder`.",
  })
  @ApiBody({ type: CreateOrderStatusDefinitionDto })
  @ApiCreatedResponse({ type: OrderStatusResponseDto })
  async createStatusDefinition(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateOrderStatusDefinitionDto,
  ): Promise<OrderStatusResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.createOrderStatusDefinitionForOwner(
      ownerId,
      dto,
      req.user?.role,
    );
  }

  @Patch("statuses/:statusId")
  @ApiOperation({
    summary: "Update order status definition",
    description:
      "System statuses (`isSystem: true`): only `name` and `color`. " +
      "Custom statuses: also `category` and `isDefault`.",
  })
  @ApiParam({ name: "statusId", type: Number })
  @ApiBody({ type: UpdateOrderStatusDefinitionDto })
  @ApiOkResponse({ type: OrderStatusResponseDto })
  async updateStatusDefinition(
    @Req() req: { user?: AuthUser },
    @Param("statusId", ParseIntPipe) statusId: number,
    @Body() dto: UpdateOrderStatusDefinitionDto,
  ): Promise<OrderStatusResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.updateOrderStatusDefinitionForOwner(
      ownerId,
      statusId,
      dto,
      req.user?.role,
    );
  }

  @Delete("statuses/:statusId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete custom order status",
    description:
      "Deletes custom statuses only. System statuses cannot be deleted. Fails if default, referenced by orders, or used in automations.",
  })
  @ApiParam({ name: "statusId", type: Number })
  @ApiNoContentResponse()
  async deleteStatusDefinition(
    @Req() req: { user?: AuthUser },
    @Param("statusId", ParseIntPipe) statusId: number,
  ): Promise<void> {
    const ownerId = this.requireNumericOwnerId(req);
    await this.orders.deleteOrderStatusDefinitionForOwner(
      ownerId,
      statusId,
      req.user?.role,
    );
  }

  @Get(":orderId/events")
  @ApiOperation({
    summary: "Order change history",
    description:
      "Append-only audit log for the order (status, items, delivery, waybill, totals). Newest first.",
  })
  @ApiParam({ name: "orderId", type: Number })
  @ApiOkResponse({ type: OrderEventsListResponseDto })
  async listEvents(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
  ): Promise<OrderEventsListResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.listOrderEventsForOwner(ownerId, orderId);
  }

  @Get(":orderId/payment")
  @ApiOperation({
    summary: "Get order payment summary",
    description:
      "Returns the same `payment` object as nested on GET /orders/:orderId " +
      "(status, amounts, capability flags, and transactions). Useful when loading payment separately.",
  })
  @ApiParam({ name: "orderId", type: Number })
  @ApiOkResponse({ type: OrderPaymentSummaryResponseDto })
  async getPayment(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
  ) {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.getOrderPayment(ownerId, orderId);
  }

  @Get(":orderId")
  @ApiOperation({
    summary: "Get order by id",
    description:
      "Includes `createdBy`, `canEditItems`, delivery tracking flags, and a `payment` object with status, paid amount, remaining amount, and all financial transactions. " +
      "Payment fields are nested under `payment` rather than returned at the order root.",
  })
  async getById(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
  ) {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.getOrderById(ownerId, orderId);
  }

  private requireNumericOwnerId(req: { user?: AuthUser }): number {
    const ownerId = Number(req.user?.userId);
    if (!Number.isInteger(ownerId) || ownerId <= 0) {
      throw new BadRequestException(
        "Current authorized user does not contain numeric owner id",
      );
    }
    return ownerId;
  }
}
