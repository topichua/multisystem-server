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
import { OrderStatusResponseDto } from "./dto/order-status-response.dto";
import { UpdateOrderDeliveryDto } from "./dto/update-order-delivery.dto";
import { UpdateOrderStatusDefinitionDto } from "./dto/update-order-status-definition.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
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
      "Single request to create an order. Only `customerId` is required. Status is always the workspace default (`order_statuses.is_default`); use PATCH /orders/:orderId/status to change it later. " +
      "Other optional fields: `conversationId`, `source`, `currency`, notes, `items`, `delivery`.",
  })
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: { user?: AuthUser }, @Body() dto: CreateOrderDto) {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.createOrder(ownerId, dto);
  }

  @Post(":orderId/items")
  @HttpCode(HttpStatus.CREATED)
  async addItem(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Body() dto: AddOrderItemDto,
  ) {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.addOrderItem(ownerId, orderId, dto);
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

  @Get()
  @ApiOperation({
    summary: "List orders",
    description:
      "Paginated orders for the workspace. Optional `clientId` limits to that customer; `statusId` filters by status.",
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

  @Post("statuses")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create custom order status",
    description:
      "Creates a non-system status (`isSystem: false`). `category` is required. Appended after existing statuses by `sortOrder`.",
  })
  @ApiBody({ type: CreateOrderStatusDefinitionDto })
  @ApiCreatedResponse({ type: OrderStatusResponseDto })
  async createStatusDefinition(
    @Req() req: { user?: AuthUser },
    @Body() dto: CreateOrderStatusDefinitionDto,
  ): Promise<OrderStatusResponseDto> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.createOrderStatusDefinitionForOwner(ownerId, dto);
  }

  @Patch("statuses/:statusId")
  @ApiOperation({
    summary: "Update order status definition",
    description:
      "Update `name`, `color`, `category` (custom only), and/or `isDefault`. Setting `isDefault: true` clears the default flag on all other statuses (only one default).",
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
    );
  }

  @Delete("statuses/:statusId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete custom order status",
    description:
      "Only non-system statuses (`isSystem: false`). Fails if default or referenced by orders.",
  })
  @ApiParam({ name: "statusId", type: Number })
  @ApiNoContentResponse()
  async deleteStatusDefinition(
    @Req() req: { user?: AuthUser },
    @Param("statusId", ParseIntPipe) statusId: number,
  ): Promise<void> {
    const ownerId = this.requireNumericOwnerId(req);
    await this.orders.deleteOrderStatusDefinitionForOwner(ownerId, statusId);
  }

  @Get(":orderId")
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
