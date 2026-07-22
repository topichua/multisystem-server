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

  @ApiProperty({ enum: ["online_payment", "manual"] })
  method!: "online_payment" | "manual";

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

  @ApiProperty({ type: [OrderPaymentEntryDto] })
  payments!: OrderPaymentEntryDto[];
}
