import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  OrderPaymentStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentRequestStatus,
} from "../../database/entities";
import { ManualPaymentMethodResponseDto } from "./manual-payment-method.dto";

export class OrderPaymentRequestResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  orderId!: number;

  @ApiProperty()
  integrationId!: number;

  @ApiProperty({ enum: PaymentMethod })
  method!: PaymentMethod;

  @ApiProperty({ enum: PaymentProvider })
  provider!: PaymentProvider;

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ enum: PaymentRequestStatus })
  status!: PaymentRequestStatus;

  @ApiPropertyOptional({ nullable: true })
  externalPaymentId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  paymentUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  expiresAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  paidAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  failureReason!: string | null;

  @ApiProperty()
  createdById!: number;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class OrderPaymentRequestsListResponseDto {
  @ApiProperty()
  orderId!: number;

  @ApiProperty()
  totalAmount!: number;

  @ApiProperty()
  paidAmount!: number;

  @ApiProperty()
  remainingAmount!: number;

  @ApiProperty({ enum: OrderPaymentStatus })
  paymentStatus!: OrderPaymentStatus;

  @ApiProperty({ type: [OrderPaymentRequestResponseDto] })
  payments!: OrderPaymentRequestResponseDto[];

  @ApiPropertyOptional({
    type: ManualPaymentMethodResponseDto,
    nullable: true,
    description: "Selected transfer method for this order. Null means cash.",
  })
  selectedManualPaymentMethod!: ManualPaymentMethodResponseDto | null;

  @ApiProperty({
    enum: ["cash", "transfer"],
    description: "cash when no transfer method is selected on the order",
  })
  selectedManualPaymentKind!: "cash" | "transfer";
}

export class OrderPaymentTransactionResponseDto {
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

  @ApiProperty({
    enum: ["cash", "transfer"],
    description: "cash when no manual payment method is linked",
  })
  manualPaymentKind!: "cash" | "transfer";

  @ApiProperty()
  occurredAt!: string;

  @ApiProperty()
  createdAt!: string;
}

export class OrderPaymentTransactionsListResponseDto {
  @ApiProperty()
  orderId!: number;

  @ApiProperty({ type: [OrderPaymentTransactionResponseDto] })
  transactions!: OrderPaymentTransactionResponseDto[];
}
