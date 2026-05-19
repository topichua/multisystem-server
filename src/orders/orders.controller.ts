import {
  BadRequestException,
  Body,
  Controller,
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
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { AddOrderItemDto } from "./dto/add-order-item.dto";
import { CreateOrderDto } from "./dto/create-order.dto";
import { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import { UpdateOrderDeliveryDto } from "./dto/update-order-delivery.dto";
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
      "Single request to create an order. Only `customerId` is required. All other fields are optional: " +
      "`conversationId`, `source`, `currency`, notes, `statusId` (else workspace default), `items` (line items, same as POST /orders/:orderId/items), and `delivery` (same as PATCH /orders/:orderId/delivery). " +
      "Omit `items` or pass `[]` for an empty order.",
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
  async list(
    @Req() req: { user?: AuthUser },
    @Query() query: ListOrdersQueryDto,
  ) {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.listOrdersByWorkspace(ownerId, query);
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
