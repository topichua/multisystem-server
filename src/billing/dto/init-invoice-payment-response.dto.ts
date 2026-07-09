import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class InitInvoicePaymentResponseDto {
  @ApiProperty({ example: 42 })
  invoiceId: number;

  @ApiProperty({
    example: "https://pay.monobank.ua/...",
    description: "Redirect the user to this URL to complete payment",
  })
  paymentUrl: string;

  @ApiProperty({ example: "monopay" })
  provider: string;

  @ApiProperty({ example: "p2_9ZgpZVsl3" })
  externalPaymentId: string;

  @ApiPropertyOptional({
    description: "True when an existing open MonoPay session was reused",
  })
  reusedExistingSession?: boolean;
}
