import {
  BadRequestException,
  Controller,
  Get,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { OrderStatusResponseDto } from "./dto/order-status-response.dto";
import { OrdersService } from "./orders.service";

/** Alias for `GET /orders/statuses` at singular `order` prefix. */
@ApiTags("orders")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("order")
export class OrderStatusesController {
  constructor(private readonly orders: OrdersService) {}

  @Get("statuses")
  @ApiOperation({
    summary: "List order statuses (alias)",
    description:
      "Same as `GET /orders/statuses`: all workspace order statuses (system + custom), ordered by `sortOrder`.",
  })
  @ApiOkResponse({ type: [OrderStatusResponseDto] })
  async listStatuses(
    @Req() req: { user?: AuthUser },
  ): Promise<OrderStatusResponseDto[]> {
    const ownerId = this.requireNumericOwnerId(req);
    return this.orders.listOrderStatusesForOwner(ownerId);
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
