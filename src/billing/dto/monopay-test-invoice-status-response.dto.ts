import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class MonopayTestInvoiceStatusResponseDto {
  @ApiProperty()
  monoInvoiceId: string;

  @ApiProperty({ example: "success" })
  status: string;

  @ApiProperty({ example: 100 })
  amount: number;

  @ApiPropertyOptional({ example: 100 })
  finalAmount?: number;

  @ApiPropertyOptional({ nullable: true })
  reference: string | null;

  @ApiPropertyOptional({ nullable: true })
  modifiedDate: string | null;

  @ApiPropertyOptional({ nullable: true })
  failureReason: string | null;

  @ApiProperty()
  paid: boolean;
}
