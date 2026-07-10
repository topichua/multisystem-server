import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { InvoiceStatus } from "../database/entities/invoice-status.enum";
import { Invoice } from "../database/entities/invoice.entity";
import { SubscriptionActivationService } from "./subscription-activation.service";
import { CreditFulfillmentService } from "./credit-fulfillment.service";

export type CompleteInvoicePaymentInput = {
  invoiceId: number;
  paidAt: Date;
  externalPaymentId: string;
  provider?: string | null;
  providerModifiedAt?: Date | null;
  paymentPageUrl?: string | null;
};

@Injectable()
export class InvoicePaymentService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    private readonly activation: SubscriptionActivationService,
    private readonly creditFulfillment: CreditFulfillmentService,
  ) {}

  async completePayment(input: CompleteInvoicePaymentInput): Promise<void> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id: input.invoiceId },
    });
    if (!invoice) {
      return;
    }
    if (invoice.status === InvoiceStatus.paid) {
      return;
    }

    invoice.status = InvoiceStatus.paid;
    invoice.paidAt = input.paidAt;
    invoice.externalPaymentId = input.externalPaymentId;
    if (input.provider != null) {
      invoice.paymentProvider = input.provider;
    }
    if (input.providerModifiedAt != null) {
      invoice.paymentProviderModifiedAt = input.providerModifiedAt;
    }
    if (input.paymentPageUrl !== undefined) {
      invoice.paymentPageUrl = input.paymentPageUrl;
    }
    await this.invoiceRepo.save(invoice);
    if (this.isCreditPurchaseInvoice(invoice)) {
      await this.creditFulfillment.fulfillPaidInvoice(invoice.id);
      return;
    }
    await this.activation.activatePaidInvoice(invoice.id, input.paidAt);
  }

  private isCreditPurchaseInvoice(invoice: Invoice): boolean {
    return invoice.lineItems.some((item) => item.type === "credit_pack");
  }

  async markPaymentFailed(invoiceId: number): Promise<void> {
    await this.markTerminalStatus(invoiceId, InvoiceStatus.open);
  }

  async markTerminalStatus(
    invoiceId: number,
    targetStatus: InvoiceStatus.open | InvoiceStatus.void,
  ): Promise<void> {
    const invoice = await this.invoiceRepo.findOne({ where: { id: invoiceId } });
    if (!invoice || invoice.status === InvoiceStatus.paid) {
      return;
    }
    invoice.status = targetStatus;
    invoice.paymentPageUrl = null;
    await this.invoiceRepo.save(invoice);
  }
}
