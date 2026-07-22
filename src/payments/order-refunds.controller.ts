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
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { CreateOrderRefundDto } from "./dto/create-order-refund.dto";
import { ReviewOrderRefundDto } from "./dto/review-order-refund.dto";
import {
  ApproveOrderRefundResponseDto,
  OrderRefundResponseDto,
  OrderRefundsListResponseDto,
} from "./dto/order-refund-response.dto";
import { OrderRefundsService } from "./order-refunds.service";

@ApiTags("orders")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("orders/:orderId/refunds")
export class OrderRefundsController {
  constructor(private readonly refunds: OrderRefundsService) {}

  @Get()
  @ApiOperation({ summary: "List order refunds" })
  @ApiParam({ name: "orderId", type: Number })
  @ApiOkResponse({ type: OrderRefundsListResponseDto })
  list(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
  ): Promise<OrderRefundsListResponseDto> {
    return this.refunds.listRefunds(
      this.requireUserId(req),
      orderId,
      req.user?.role,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create pending order refund",
    description:
      "Creates a refund request in `pending` status. Does not change paid amount " +
      "until approved via POST /orders/:orderId/refunds/:refundId/approve.",
  })
  @ApiParam({ name: "orderId", type: Number })
  @ApiCreatedResponse({ type: OrderRefundResponseDto })
  create(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Body() dto: CreateOrderRefundDto,
  ): Promise<OrderRefundResponseDto> {
    return this.refunds.createRefund(
      this.requireUserId(req),
      orderId,
      dto,
      req.user?.role,
    );
  }

  @Post(":refundId/approve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Approve pending refund",
    description:
      "Marks refund as approved, posts a succeeded refund ledger transaction, " +
      "and recalculates order payment status (paid → partial / unpaid / refunded).",
  })
  @ApiParam({ name: "orderId", type: Number })
  @ApiParam({ name: "refundId", type: Number })
  @ApiOkResponse({ type: ApproveOrderRefundResponseDto })
  approve(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Param("refundId", ParseIntPipe) refundId: number,
    @Body() dto: ReviewOrderRefundDto,
  ): Promise<ApproveOrderRefundResponseDto> {
    return this.refunds.approveRefund(
      this.requireUserId(req),
      orderId,
      refundId,
      dto ?? {},
      req.user?.role,
    );
  }

  @Delete(":refundId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete pending refund" })
  @ApiParam({ name: "orderId", type: Number })
  @ApiParam({ name: "refundId", type: Number })
  @ApiNoContentResponse({ description: "Pending refund deleted." })
  async remove(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Param("refundId", ParseIntPipe) refundId: number,
  ): Promise<void> {
    await this.refunds.deletePendingRefund(
      this.requireUserId(req),
      orderId,
      refundId,
      req.user?.role,
    );
  }

  private requireUserId(req: { user?: AuthUser }): number {
    const userId = Number(req.user?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException("Unauthorized");
    }
    return userId;
  }
}
