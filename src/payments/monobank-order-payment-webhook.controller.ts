import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { OrderPaymentsService } from "./order-payments.service";

@ApiTags("webhooks")
@Controller("webhooks/payments/monobank")
export class MonobankOrderPaymentWebhookController {
  constructor(private readonly orderPayments: OrderPaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Monobank order payment webhook",
    description: "Receives invoice status updates for order payment links.",
  })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-sign") xSign: string | undefined,
  ): Promise<{ ok: true }> {
    const rawBody = req.rawBody;
    if (!rawBody?.length) {
      throw new UnauthorizedException("Missing raw request body");
    }
    await this.orderPayments.handleMonobankWebhook(rawBody, {
      "x-sign": xSign,
      "X-Sign": xSign,
    });
    return { ok: true };
  }
}
