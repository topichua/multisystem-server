import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { InvoiceStatus } from "../database/entities/invoice-status.enum";
import { Invoice } from "../database/entities/invoice.entity";
import type {
  InvoiceDetailResponseDto,
  InvoicesListResponseDto,
} from "./dto/invoice-detail-response.dto";
import { InvoicePaymentService } from "./invoice-payment.service";

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    private readonly invoicePayment: InvoicePaymentService,
  ) {}

  async listForWorkspace(
    workspaceId: number,
    page: number,
    pageSize: number,
  ): Promise<InvoicesListResponseDto> {
    const [rows, total] = await this.invoiceRepo.findAndCount({
      where: { workspaceId },
      order: { createdAt: "DESC", id: "DESC" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return {
      items: rows.map((row) => this.toListItem(row)),
      total,
      page,
      pageSize,
    };
  }

  async getForWorkspace(
    workspaceId: number,
    invoiceId: number,
  ): Promise<InvoiceDetailResponseDto> {
    const row = await this.invoiceRepo.findOne({
      where: { id: invoiceId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Invoice not found");
    }
    return this.toDetail(row);
  }

  async markAsPaidEmulated(
    workspaceId: number,
    invoiceId: number,
  ): Promise<InvoiceDetailResponseDto> {
    const row = await this.invoiceRepo.findOne({
      where: { id: invoiceId, workspaceId },
    });
    if (!row) {
      throw new NotFoundException("Invoice not found");
    }
    if (row.status === InvoiceStatus.paid) {
      return this.toDetail(row);
    }
    if (
      row.status !== InvoiceStatus.open &&
      row.status !== InvoiceStatus.draft
    ) {
      throw new BadRequestException(
        `Invoice cannot be marked paid from status "${row.status}"`,
      );
    }

    const paidAt = new Date();
    await this.invoicePayment.completePayment({
      invoiceId,
      paidAt,
      externalPaymentId:
        row.externalPaymentId ?? `emulated-${invoiceId}-${paidAt.getTime()}`,
      provider: row.paymentProvider,
      providerModifiedAt: paidAt,
      paymentPageUrl: null,
    });
    return this.getForWorkspace(workspaceId, invoiceId);
  }

  private toListItem(row: Invoice) {
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      amount: row.amount,
      currency: row.currency,
      periodStart: row.periodStart?.toISOString() ?? null,
      periodEnd: row.periodEnd?.toISOString() ?? null,
      description: row.description,
      paidAt: row.paidAt?.toISOString() ?? null,
      dueAt: row.dueAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toDetail(row: Invoice): InvoiceDetailResponseDto {
    return {
      ...this.toListItem(row),
      subscriptionId: row.subscriptionId,
      lineItems: row.lineItems,
      externalPaymentId: row.externalPaymentId,
      paymentPageUrl: row.paymentPageUrl,
      paymentProvider: row.paymentProvider,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
