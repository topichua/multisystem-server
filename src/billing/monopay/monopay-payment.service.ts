import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { InvoiceStatus } from "../../database/entities/invoice-status.enum";
import { Invoice } from "../../database/entities/invoice.entity";
import {
  MONOPAY_CCY_UAH,
  MONOPAY_PROVIDER,
  type MonopayInvoiceWebhookPayload,
} from "./monopay.types";
import { MonopayApiService } from "./monopay-api.service";
import { InvoicePaymentService } from "../invoice-payment.service";
import { sanitizeMonopayPayloadForLog } from "./monopay.util";
import type { InitInvoicePaymentResponseDto } from "../dto/init-invoice-payment-response.dto";
import type { SyncInvoicePaymentResponseDto } from "../dto/sync-invoice-payment-response.dto";

@Injectable()
export class MonopayPaymentService {
  private readonly logger = new Logger(MonopayPaymentService.name);

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    private readonly monopayApi: MonopayApiService,
    private readonly invoicePayment: InvoicePaymentService,
  ) {}

  async initPaymentForInvoice(
    workspaceId: number,
    invoiceId: number,
  ): Promise<InitInvoicePaymentResponseDto> {
    if (!this.monopayApi.isConfigured()) {
      throw new ServiceUnavailableException(
        "Merchant token not configured (MONOPAY_MERCHANT_TOKEN)",
      );
    }

    const invoice = await this.invoiceRepo.findOne({
      where: { id: invoiceId, workspaceId },
    });
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    if (invoice.status === InvoiceStatus.paid) {
      throw new BadRequestException("Invoice is already paid");
    }
    if (
      invoice.status !== InvoiceStatus.open &&
      invoice.status !== InvoiceStatus.draft
    ) {
      throw new BadRequestException(
        `Invoice cannot be paid from status "${invoice.status}"`,
      );
    }
    if (invoice.currency !== "UAH") {
      throw new BadRequestException("MonoPay supports UAH invoices only");
    }

    if (
      invoice.paymentPageUrl &&
      invoice.externalPaymentId &&
      invoice.paymentProvider === MONOPAY_PROVIDER
    ) {
      this.logger.log(
        `Reusing MonoPay session localInvoiceId=${invoice.id} monoInvoiceId=${invoice.externalPaymentId}`,
      );
      return {
        invoiceId: invoice.id,
        paymentUrl: invoice.paymentPageUrl,
        provider: MONOPAY_PROVIDER,
        externalPaymentId: invoice.externalPaymentId,
        reusedExistingSession: true,
      };
    }

    const amountKopiyky = Math.round(invoice.amount * 100);
    if (amountKopiyky <= 0) {
      throw new BadRequestException("Invoice amount must be greater than zero");
    }

    const monoInvoice = await this.monopayApi.createInvoice({
      amount: amountKopiyky,
      ccy: MONOPAY_CCY_UAH,
      merchantPaymInfo: {
        reference: invoice.number,
        destination: invoice.description ?? `Invoice ${invoice.number}`,
        comment: invoice.description ?? undefined,
      },
      redirectUrl: this.monopayApi.resolveRedirectUrl(),
      webHookUrl: this.monopayApi.resolveWebhookUrl(),
      validity: this.monopayApi.getInvoiceValiditySeconds(),
      paymentType: "debit",
    });

    invoice.externalPaymentId = monoInvoice.invoiceId;
    invoice.paymentPageUrl = monoInvoice.pageUrl;
    invoice.paymentProvider = MONOPAY_PROVIDER;
    await this.invoiceRepo.save(invoice);

    this.logger.log(
      `MonoPay checkout created localInvoiceId=${invoice.id} monoInvoiceId=${monoInvoice.invoiceId} amountKop=${amountKopiyky}`,
    );

    return {
      invoiceId: invoice.id,
      paymentUrl: monoInvoice.pageUrl,
      provider: MONOPAY_PROVIDER,
      externalPaymentId: monoInvoice.invoiceId,
      reusedExistingSession: false,
    };
  }

  async syncPaymentFromProvider(
    workspaceId: number,
    invoiceId: number,
  ): Promise<SyncInvoicePaymentResponseDto> {
    if (!this.monopayApi.isConfigured()) {
      throw new ServiceUnavailableException("Merchant token not configured");
    }

    const invoice = await this.invoiceRepo.findOne({
      where: { id: invoiceId, workspaceId },
    });
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    if (invoice.status === InvoiceStatus.paid) {
      return {
        invoiceId: invoice.id,
        providerStatus: "success",
        localStatus: invoice.status,
        activated: true,
        message: "Invoice is already paid",
      };
    }
    if (!invoice.externalPaymentId) {
      throw new BadRequestException(
        "Invoice has no MonoPay session; call POST /invoices/:id/pay first",
      );
    }

    const providerStatus = await this.monopayApi.getInvoiceStatus(
      invoice.externalPaymentId,
    );
    await this.applyProviderPayload(invoice, providerStatus, "sync");

    const refreshed = await this.invoiceRepo.findOne({
      where: { id: invoice.id },
    });
    return {
      invoiceId: invoice.id,
      providerStatus: providerStatus.status,
      localStatus: refreshed?.status ?? invoice.status,
      activated: refreshed?.status === InvoiceStatus.paid,
      message:
        refreshed?.status === InvoiceStatus.paid
          ? "Payment confirmed via MonoPay status API"
          : `MonoPay status is "${providerStatus.status}" — not paid yet`,
    };
  }

  async handleWebhook(
    rawBody: Buffer,
    xSign: string | undefined,
    payload: MonopayInvoiceWebhookPayload,
  ): Promise<void> {
    this.logger.log(
      `MonoPay webhook received payload=${JSON.stringify(sanitizeMonopayPayloadForLog(payload as unknown as Record<string, unknown>))}`,
    );

    const valid = await this.monopayApi.verifyWebhookSignature(rawBody, xSign);
    if (!valid) {
      this.logger.warn(
        `MonoPay webhook signature invalid monoInvoiceId=${payload.invoiceId}`,
      );
      throw new BadRequestException("Invalid MonoPay webhook signature");
    }

    const invoice = await this.findInvoiceForWebhook(payload);
    if (!invoice) {
      this.logger.warn(
        `MonoPay webhook: no local invoice for monoInvoiceId=${payload.invoiceId} reference=${payload.reference ?? "?"}`,
      );
      return;
    }

    const modifiedAt = payload.modifiedDate
      ? new Date(payload.modifiedDate)
      : new Date();
    if (
      invoice.paymentProviderModifiedAt &&
      modifiedAt.getTime() <= invoice.paymentProviderModifiedAt.getTime()
    ) {
      this.logger.log(
        `MonoPay webhook skipped (stale) localInvoiceId=${invoice.id} monoInvoiceId=${payload.invoiceId}`,
      );
      return;
    }

    invoice.paymentProviderModifiedAt = modifiedAt;
    await this.invoiceRepo.save(invoice);

    await this.applyProviderPayload(invoice, payload, "webhook");
  }

  private async applyProviderPayload(
    invoice: Invoice,
    payload: MonopayInvoiceWebhookPayload,
    source: "webhook" | "sync",
  ): Promise<void> {
    const modifiedAt = payload.modifiedDate
      ? new Date(payload.modifiedDate)
      : new Date();

    if (payload.status === "success") {
      const expectedKop = Math.round(invoice.amount * 100);
      const paidKop = payload.finalAmount ?? payload.amount;
      if (paidKop !== expectedKop) {
        this.logger.error(
          `MonoPay amount mismatch localInvoiceId=${invoice.id} expectedKop=${expectedKop} gotKop=${paidKop} source=${source} — NOT marking paid`,
        );
        if (source === "sync") {
          throw new BadRequestException(
            `Payment amount mismatch: expected ${expectedKop} kop, got ${paidKop}`,
          );
        }
        return;
      }

      this.logger.log(
        `MonoPay payment success localInvoiceId=${invoice.id} monoInvoiceId=${payload.invoiceId} source=${source}`,
      );
      await this.invoicePayment.completePayment({
        invoiceId: invoice.id,
        paidAt: modifiedAt,
        externalPaymentId: payload.invoiceId,
        provider: MONOPAY_PROVIDER,
        providerModifiedAt: modifiedAt,
        paymentPageUrl: null,
      });
      return;
    }

    if (payload.status === "failure" || payload.status === "reversed") {
      this.logger.warn(
        `MonoPay payment ${payload.status} localInvoiceId=${invoice.id} reason=${payload.failureReason ?? "?"}`,
      );
      await this.invoicePayment.markTerminalStatus(
        invoice.id,
        InvoiceStatus.open,
      );
      return;
    }

    if (payload.status === "expired") {
      this.logger.warn(
        `MonoPay invoice expired localInvoiceId=${invoice.id} monoInvoiceId=${payload.invoiceId}`,
      );
      await this.invoicePayment.markTerminalStatus(
        invoice.id,
        InvoiceStatus.void,
      );
    }
  }

  private async findInvoiceForWebhook(
    payload: MonopayInvoiceWebhookPayload,
  ): Promise<Invoice | null> {
    if (payload.invoiceId?.trim()) {
      const byExternal = await this.invoiceRepo.findOne({
        where: {
          externalPaymentId: payload.invoiceId.trim(),
          paymentProvider: MONOPAY_PROVIDER,
        },
      });
      if (byExternal) {
        return byExternal;
      }
    }
    if (payload.reference?.trim()) {
      return this.invoiceRepo.findOne({
        where: { number: payload.reference.trim() },
      });
    }
    return null;
  }
}
