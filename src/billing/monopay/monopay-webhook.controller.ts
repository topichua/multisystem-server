import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { MonopayPaymentService } from "./monopay-payment.service";
import type { MonopayInvoiceWebhookPayload } from "./monopay.types";

@ApiTags("webhooks")
@Controller("webhooks/monopay")
export class MonopayWebhookController {
  private readonly logger = new Logger(MonopayWebhookController.name);

  constructor(private readonly monopayPayment: MonopayPaymentService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "MonoPay payment status webhook",
    description:
      "Receives invoice status updates from MonoPay. Verified via X-Sign (ECDSA).",
  })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-sign") xSign: string | undefined,
  ): Promise<{ ok: true }> {
    const rawBody = req.rawBody;
    if (!rawBody?.length) {
      throw new UnauthorizedException("Missing raw request body");
    }

    const payload = this.parsePayload(rawBody);
    this.logger.log(
      `MonoPay webhook HTTP received invoiceId=${payload.invoiceId} status=${payload.status}`,
    );
    await this.monopayPayment.handleWebhook(rawBody, xSign, payload);
    return { ok: true };
  }

  private parsePayload(rawBody: Buffer): MonopayInvoiceWebhookPayload {
    try {
      return JSON.parse(
        rawBody.toString("utf8"),
      ) as MonopayInvoiceWebhookPayload;
    } catch {
      throw new UnauthorizedException("Invalid JSON body");
    }
  }
}
