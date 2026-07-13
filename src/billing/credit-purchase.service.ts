import { ConflictException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { InvoiceStatus } from "../database/entities/invoice-status.enum";
import { Invoice } from "../database/entities/invoice.entity";
import type { InvoiceLinePurpose } from "../database/entities/invoice.entity";
import { CreditPricingService } from "./credit-pricing.service";
import type { PurchaseCreditsResponseDto } from "./dto/purchase-credits-response.dto";
import { InvoicesService } from "./invoices.service";

@Injectable()
export class CreditPurchaseService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    private readonly creditPricing: CreditPricingService,
    private readonly invoices: InvoicesService,
  ) {}

  async createPurchaseInvoice(
    workspaceId: number,
    creditsAmount: number,
  ): Promise<PurchaseCreditsResponseDto> {
    const pricing = await this.creditPricing.requireActivePricing();
    this.creditPricing.validatePurchaseAmount(pricing, creditsAmount);

    const existingOpen = await this.findOpenCreditPurchaseInvoice(workspaceId);
    if (existingOpen) {
      throw new ConflictException(
        "An open credit purchase invoice already exists. Pay or void it before creating a new one.",
      );
    }

    const amount = this.creditPricing.calculatePurchaseAmount(
      pricing,
      creditsAmount,
    );
    const purpose: InvoiceLinePurpose = "credit_purchase";

    const invoice = await this.invoiceRepo.save(
      this.invoiceRepo.create({
        workspaceId,
        subscriptionId: null,
        number: await this.generateInvoiceNumber(workspaceId),
        status: InvoiceStatus.open,
        amount,
        currency: pricing.currency,
        periodStart: null,
        periodEnd: null,
        description: `AI credits — ${creditsAmount}`,
        lineItems: [
          {
            type: "credit_pack",
            description: `${creditsAmount} AI credits`,
            amount,
            quantity: creditsAmount,
            creditsAmount,
            purpose,
          },
        ],
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        paidAt: null,
        externalPaymentId: null,
      }),
    );

    return {
      invoice: await this.invoices.getForWorkspace(workspaceId, invoice.id),
      message:
        "Credit purchase invoice created. Pay the invoice to add credits to your workspace.",
    };
  }

  private async findOpenCreditPurchaseInvoice(
    workspaceId: number,
  ): Promise<Invoice | null> {
    const openInvoices = await this.invoiceRepo.find({
      where: { workspaceId, status: InvoiceStatus.open },
      order: { id: "DESC" },
    });
    return (
      openInvoices.find((invoice) =>
        invoice.lineItems.some((item) => item.type === "credit_pack"),
      ) ?? null
    );
  }

  private async generateInvoiceNumber(workspaceId: number): Promise<string> {
    const year = new Date().getUTCFullYear();
    const count = await this.invoiceRepo.count();
    return `INV-${year}-${workspaceId}-${String(count + 1).padStart(6, "0")}`;
  }
}
