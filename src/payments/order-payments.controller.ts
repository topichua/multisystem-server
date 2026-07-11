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
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/types/auth-user.type";
import { CreateOrderPaymentLinkDto } from "./dto/create-order-payment-link.dto";
import { CreateManualPaymentDto } from "./dto/create-manual-payment.dto";
import { ManualPaymentResponseDto } from "./dto/manual-payment-response.dto";
import {
  OrderPaymentRequestResponseDto,
  OrderPaymentRequestsListResponseDto,
  OrderPaymentTransactionsListResponseDto,
} from "./dto/order-payment-request-response.dto";
import { OrderPaymentsService } from "./order-payments.service";

@ApiTags("orders")
@ApiBearerAuth("bearer")
@UseGuards(JwtAuthGuard)
@Controller("orders/:orderId/payments")
export class OrderPaymentsController {
  constructor(private readonly payments: OrderPaymentsService) {}

  @Get()
  @ApiOperation({ summary: "List payment links (requests) for order" })
  @ApiParam({ name: "orderId", type: Number })
  @ApiOkResponse({ type: OrderPaymentRequestsListResponseDto })
  list(
    @Req() req: { user?: AuthUser },
    @Param("orderId", ParseIntPipe) orderId: number,
  ): Promise<OrderPaymentRequestsListResponseDto> {
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

  @Post("manual")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Record manual payment (card transfer, FOP, cash, etc.)",
    description:
      "Creates a charge transaction with source=manual and recalculates order payment status.",
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
