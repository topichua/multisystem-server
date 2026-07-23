import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  OrderPaymentStatus,
  PaymentProvider,
} from "../../database/entities";

/** Matches `order.payment.payments[]` from GET /orders/:orderId. */
export class OrderPaymentEntryDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ nullable: true })
  paymentId!: number | null;

  @ApiPropertyOptional({ enum: PaymentProvider, nullable: true })
  provider!: PaymentProvider | null;

  @ApiPropertyOptional({ nullable: true })
  manualPaymentMethodId!: number | null;

  @ApiProperty()
  type!: string;

  @ApiProperty({ enum: ["online_payment", "manual", "nova_poshta_payment"] })
  method!: "online_payment" | "manual" | "nova_poshta_payment";

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  source!: string;

  @ApiPropertyOptional({ nullable: true })
  externalTransactionId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiPropertyOptional({ nullable: true })
  confirmedById!: number | null;

  @ApiProperty()
  occurredAt!: string;

  @ApiProperty()
  createdAt!: string;
}

/**
 * Same shape as `payment` on GET /orders/:orderId.
 */
export class OrderPaymentSummaryResponseDto {
  @ApiProperty({ enum: OrderPaymentStatus })
  status!: OrderPaymentStatus;

  @ApiPropertyOptional({ nullable: true })
  statusAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  paidAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reference!: string | null;

  @ApiPropertyOptional({ nullable: true })
  manualPaymentMethodId!: number | null;

  @ApiProperty()
  paidAmount!: number;

  @ApiProperty()
  remainingAmount!: number;

  @ApiProperty({
    description:
      "True when payment status is not paid/overpaid and there is no pending charge.",
  })
  canCreatePayment!: boolean;

  @ApiProperty({
    description: "True when there is paid amount available to refund.",
  })
  canRefund!: boolean;

  @ApiProperty({ type: [OrderPaymentEntryDto] })
  payments!: OrderPaymentEntryDto[];
}
