import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { OrderPaymentStatus } from "../../database/entities";

export class ManualPaymentTransactionDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ nullable: true })
  paymentId!: number | null;

  @ApiProperty({ nullable: true })
  provider!: string | null;

  @ApiProperty()
  type!: string;

  @ApiProperty({
    enum: ["online_payment", "manual"],
    description:
      "`online_payment` for provider payment links; `manual` for cash/transfer. Online payments cannot be confirmed manually.",
  })
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
  manualPaymentMethodId!: number | null;

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

export class ManualPaymentResponseDto {
  @ApiProperty()
  orderId!: number;

  @ApiProperty({ enum: OrderPaymentStatus })
  paymentStatus!: OrderPaymentStatus;

  @ApiProperty()
  totalAmount!: number;

  @ApiProperty()
  paidAmount!: number;

  @ApiProperty()
  remainingAmount!: number;

  @ApiProperty({ type: ManualPaymentTransactionDto })
  transaction!: ManualPaymentTransactionDto;
}
