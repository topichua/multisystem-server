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
    enum: ["online_payment", "manual", "nova_poshta_payment"],
    description:
      "`online_payment` for provider payment links; `manual` for cash/transfer; " +
      "`nova_poshta_payment` for COD via Nova Poshta. Online and Nova Poshta payments cannot be confirmed via manual approve.",
  })
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
