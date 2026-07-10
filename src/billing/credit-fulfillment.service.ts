import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Invoice } from "../database/entities/invoice.entity";
import type { InvoiceLineItem } from "../database/entities/invoice.entity";
import { WorkspaceEntitlements } from "../database/entities/workspace-entitlements.entity";

@Injectable()
export class CreditFulfillmentService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(WorkspaceEntitlements)
    private readonly entitlementsRepo: Repository<WorkspaceEntitlements>,
  ) {}

  async fulfillPaidInvoice(invoiceId: number): Promise<void> {
    await this.invoiceRepo.manager.transaction(async (em) => {
      const invoice = await em.getRepository(Invoice).findOne({
        where: { id: invoiceId },
        lock: { mode: "pessimistic_write" },
      });
      if (!invoice) {
        return;
      }

      const creditsAmount = this.resolveCreditsAmount(invoice.lineItems);
      if (creditsAmount <= 0) {
        throw new InternalServerErrorException(
          "Credit purchase invoice has no credits amount",
        );
      }

      const entitlements = await em.getRepository(WorkspaceEntitlements).findOne({
        where: { workspaceId: invoice.workspaceId },
        lock: { mode: "pessimistic_write" },
      });
      if (!entitlements) {
        throw new InternalServerErrorException("Workspace entitlements not found");
      }

      entitlements.aiCreditsPurchased += creditsAmount;
      await em.getRepository(WorkspaceEntitlements).save(entitlements);
    });
  }

  private resolveCreditsAmount(lineItems: InvoiceLineItem[]): number {
    const item = lineItems.find((line) => line.type === "credit_pack");
    return item?.creditsAmount ?? 0;
  }
}
