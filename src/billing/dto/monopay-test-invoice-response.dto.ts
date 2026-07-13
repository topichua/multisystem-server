import { ApiProperty } from "@nestjs/swagger";
import { MonopayIntegrationInfoDto } from "./monopay-integration-info.dto";

export class MonopayTestInvoiceResponseDto {
  @ApiProperty({ example: "p2_9ZgpZVsl3" })
  monoInvoiceId: string;

  @ApiProperty({ example: "https://pay.monobank.ua/..." })
  paymentUrl: string;

  @ApiProperty({ example: "TEST-1739123456789" })
  reference: string;

  @ApiProperty({ example: 1 })
  amountUah: number;

  @ApiProperty({
    example: 100,
    description: "Amount in kopiyky sent to MonoPay",
  })
  amountKopiyky: number;

  @ApiProperty({ type: MonopayIntegrationInfoDto })
  integration: MonopayIntegrationInfoDto;

  @ApiProperty({ type: [String] })
  nextSteps: string[];
}
