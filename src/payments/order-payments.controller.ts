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
  Patch,
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
import { CreateOrderPaymentLinkDto } from "./dto/create-order-payment-link.dto";
import { CreateManualPaymentDto } from "./dto/create-manual-payment.dto";
import { ConfirmManualPaymentDto } from "./dto/confirm-manual-payment.dto";
import { SetOrderManualPaymentMethodDto } from "./dto/set-order-manual-payment-method.dto";
import { ManualPaymentResponseDto } from "./dto/manual-payment-response.dto";
import {
  OrderPaymentRequestResponseDto,
  OrderPaymentTransactionsListResponseDto,
} from "./dto/order-payment-request-response.dto";
import { OrderPaymentSummaryResponseDto } from "./dto/order-payment-summary-response.dto";
import { OrderPaymentsService } from "./order-payments.service";

@ApiTags("orders")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("orders/:orderId/payments")
export class OrderPaymentsController {
  constructor(private readonly payments: OrderPaymentsService) {}

  @Get()
  @ApiOperation({
    summary: "Get order payment summary",
    description:
      "Same shape as `payment` on GET /orders/:orderId. " +
      "Pending/processing online payments are synced from the provider first.",
  })
  @ApiParam({ name: "orderId", type: Number })
  @ApiOkResponse({ type: OrderPaymentSummaryResponseDto })
  list(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
  ): Promise<OrderPaymentSummaryResponseDto> {
    return this.payments.listPaymentRequestsForOrder(
      this.requireUserId(req),
      orderId,
      req.user?.role,
    );
  }

  @Get("transactions")
  @ApiOperation({ summary: "List financial payment transactions for order" })
  @ApiParam({ name: "orderId", type: Number })
  @ApiOkResponse({ type: OrderPaymentTransactionsListResponseDto })
  listTransactions(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
  ): Promise<OrderPaymentTransactionsListResponseDto> {
    return this.payments.listTransactionsForOrder(
      this.requireUserId(req),
      orderId,
      req.user?.role,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create online payment link for order" })
  @ApiParam({ name: "orderId", type: Number })
  @ApiCreatedResponse({ type: OrderPaymentRequestResponseDto })
  createLink(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Body() dto: CreateOrderPaymentLinkDto,
  ): Promise<OrderPaymentRequestResponseDto> {
    return this.payments.createPaymentLink(
      this.requireUserId(req),
      orderId,
      dto,
      req.user?.role,
    );
  }

  @Patch("manual-method")
  @ApiOperation({
    summary: "Set or clear selected manual payment method for order",
    description:
      "Stores which IBAN/card details should be sent to the client. Pass null for cash.",
  })
  @ApiParam({ name: "orderId", type: Number })
  @ApiOkResponse({ type: OrderPaymentSummaryResponseDto })
  setManualMethod(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Body() dto: SetOrderManualPaymentMethodDto,
  ): Promise<OrderPaymentSummaryResponseDto> {
    return this.payments.setOrderManualPaymentMethod(
      this.requireUserId(req),
      orderId,
      dto,
      req.user?.role,
    );
  }

  @Post("manual")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Create pending manual payment",
    description:
      "Creates a manual charge transaction with status `pending`. " +
      "It does not change order paid amount until confirmed. " +
      "Omit manualPaymentMethodId for cash; pass method id for IBAN/card transfer. " +
      "Confirm with POST /orders/:orderId/payments/transactions/:transactionId/confirm.",
  })
  @ApiParam({ name: "orderId", type: Number })
  @ApiCreatedResponse({ type: ManualPaymentResponseDto })
  recordManual(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Body() dto: CreateManualPaymentDto,
  ): Promise<ManualPaymentResponseDto> {
    return this.payments.recordManualPayment(
      this.requireUserId(req),
      orderId,
      dto,
      req.user?.role,
    );
  }

  @Post("transactions/:transactionId/confirm")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Confirm pending manual payment as paid",
    description:
      "Marks a pending manual charge transaction as `succeeded`, then recalculates order payment status / remaining amount.",
  })
  @ApiParam({ name: "orderId", type: Number })
  @ApiParam({ name: "transactionId", type: Number })
  @ApiOkResponse({ type: ManualPaymentResponseDto })
  confirmManual(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Param("transactionId", ParseIntPipe) transactionId: number,
    @Body() dto: ConfirmManualPaymentDto,
  ): Promise<ManualPaymentResponseDto> {
    return this.payments.confirmManualPayment(
      this.requireUserId(req),
      orderId,
      transactionId,
      dto ?? {},
      req.user?.role,
    );
  }

  @Delete(":paymentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete pending order payment",
    description:
      "Deletes a pending payment. Accepts either a payment **transaction** id " +
      "(from `order.payment.payments[]`) or an online payment **request** id " +
      "(from `GET /orders/:orderId/payments` / create-link response). " +
      "For online payments, also removes the linked payment request and cancels " +
      "the provider invoice when possible. Succeeded payments cannot be deleted.",
  })
  @ApiParam({ name: "orderId", type: Number })
  @ApiParam({
    name: "paymentId",
    type: Number,
    description:
      "Pending payment transaction id, or online payment request id.",
  })
  @ApiNoContentResponse({ description: "Pending payment deleted." })
  async deletePending(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Param("paymentId", ParseIntPipe) paymentId: number,
  ): Promise<void> {
    await this.payments.deletePendingPayment(
      this.requireUserId(req),
      orderId,
      paymentId,
      req.user?.role,
    );
  }

  @Post(":paymentId/sync")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Sync payment status from provider" })
  @ApiParam({ name: "orderId", type: Number })
  @ApiParam({ name: "paymentId", type: Number })
  @ApiOkResponse({ type: OrderPaymentRequestResponseDto })
  sync(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Param("paymentId", ParseIntPipe) paymentId: number,
  ): Promise<OrderPaymentRequestResponseDto> {
    return this.payments.syncPaymentStatus(
      this.requireUserId(req),
      orderId,
      paymentId,
      req.user?.role,
    );
  }

  @Post(":paymentId/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel pending payment link" })
  @ApiParam({ name: "orderId", type: Number })
  @ApiParam({ name: "paymentId", type: Number })
  @ApiOkResponse({ type: OrderPaymentRequestResponseDto })
  cancel(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
    @Param("paymentId", ParseIntPipe) paymentId: number,
  ): Promise<OrderPaymentRequestResponseDto> {
    return this.payments.cancelPaymentLink(
      this.requireUserId(req),
      orderId,
      paymentId,
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
