import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { MonopayApiService } from "./monopay-api.service";
import { MONOPAY_CCY_UAH } from "./monopay.types";
import type { MonopayTestInvoiceResponseDto } from "../dto/monopay-test-invoice-response.dto";
import type { MonopayTestInvoiceStatusResponseDto } from "../dto/monopay-test-invoice-status-response.dto";

/** Direct MonoPay API smoke test — 1 UAH invoice, no workspace billing record. */
@Injectable()
export class MonopayTestService {
  constructor(private readonly monopayApi: MonopayApiService) {}

  async createOneUahTestInvoice(): Promise<MonopayTestInvoiceResponseDto> {
    if (!this.monopayApi.isConfigured()) {
      throw new ServiceUnavailableException(
        "Merchant token not configured (MONOPAY_MERCHANT_TOKEN)",
      );
    }

    const reference = `TEST-${Date.now()}`;
    const monoInvoice = await this.monopayApi.createInvoice({
      amount: 100,
      ccy: MONOPAY_CCY_UAH,
      merchantPaymInfo: {
        reference,
        destination: "MultiSale API test — 1 UAH",
        comment: "Billing integration test",
      },
      redirectUrl: this.monopayApi.resolveRedirectUrl(),
      webHookUrl: this.monopayApi.resolveWebhookUrl(),
      validity: 3600,
      paymentType: "debit",
    });

    return {
      monoInvoiceId: monoInvoice.invoiceId,
      paymentUrl: monoInvoice.pageUrl,
      reference,
      amountUah: 1,
      amountKopiyky: 100,
      integration: this.monopayApi.getIntegrationInfo(),
      nextSteps: [
        "Open paymentUrl and complete payment in MonoPay",
        `GET /billing/monopay/test-invoice/${monoInvoice.invoiceId}/status`,
        "Or wait for POST /webhooks/monopay (requires public HTTPS webhook URL)",
      ],
    };
  }

  async getTestInvoiceStatus(
    monoInvoiceId: string,
  ): Promise<MonopayTestInvoiceStatusResponseDto> {
    const status = await this.monopayApi.getInvoiceStatus(monoInvoiceId);
    return {
      monoInvoiceId,
      status: status.status,
      amount: status.amount,
      finalAmount: status.finalAmount,
      reference: status.reference ?? null,
      modifiedDate: status.modifiedDate ?? null,
      failureReason: status.failureReason ?? null,
      paid: status.status === "success",
    };
  }
}
