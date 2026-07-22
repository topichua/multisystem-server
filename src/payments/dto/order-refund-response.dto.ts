import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  OrderPaymentStatus,
  OrderRefundStatus,
} from "../../database/entities";

export class OrderRefundResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  orderId!: number;

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ enum: OrderRefundStatus })
  status!: OrderRefundStatus;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiProperty()
  createdById!: number;

  @ApiPropertyOptional({ nullable: true })
  reviewedById!: number | null;

  @ApiPropertyOptional({ nullable: true })
  reviewedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  paymentTransactionId!: number | null;

  @ApiProperty()
  occurredAt!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class OrderRefundsListResponseDto {
  @ApiProperty()
  orderId!: number;

  @ApiProperty({ type: [OrderRefundResponseDto] })
  refunds!: OrderRefundResponseDto[];
}

export class ApproveOrderRefundResponseDto {
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

  @ApiProperty({ type: OrderRefundResponseDto })
  refund!: OrderRefundResponseDto;
}
