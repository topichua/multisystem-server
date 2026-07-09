import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { InvoiceStatus } from "../../database/entities/invoice-status.enum";
import type { InvoiceLineItem } from "../../database/entities/invoice.entity";

export class InvoiceListItemResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty({ example: "INV-2026-1-000042" })
  number: string;

  @ApiProperty({ enum: InvoiceStatus })
  status: InvoiceStatus;

  @ApiProperty({ example: 1490 })
  amount: number;

  @ApiProperty({ example: "UAH" })
  currency: string;

  @ApiPropertyOptional({ nullable: true })
  periodStart: string | null;

  @ApiPropertyOptional({ nullable: true })
  periodEnd: string | null;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ nullable: true })
  paidAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  dueAt: string | null;

  @ApiProperty()
  createdAt: string;
}

export class InvoicesListResponseDto {
  @ApiProperty({ type: [InvoiceListItemResponseDto] })
  items: InvoiceListItemResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}

export class InvoiceDetailResponseDto extends InvoiceListItemResponseDto {
  @ApiProperty({ nullable: true })
  subscriptionId: number | null;

  @ApiProperty({
    example: [
      {
        type: "subscription",
        description: "Pro",
        amount: 1490,
        quantity: 1,
      },
    ],
  })
  lineItems: InvoiceLineItem[];

  @ApiPropertyOptional({ nullable: true })
  externalPaymentId: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "MonoPay checkout URL when payment was initiated",
  })
  paymentPageUrl: string | null;

  @ApiPropertyOptional({ nullable: true, example: "monopay" })
  paymentProvider: string | null;

  @ApiProperty()
  updatedAt: string;
}
