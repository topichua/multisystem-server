import { ApiProperty } from "@nestjs/swagger";
import { InvoiceDetailResponseDto } from "./invoice-detail-response.dto";

export class PurchaseCreditsResponseDto {
  @ApiProperty({ type: InvoiceDetailResponseDto })
  invoice: InvoiceDetailResponseDto;

  @ApiProperty({
    example:
      "Credit purchase invoice created. Pay the invoice to add credits to your workspace.",
  })
  message: string;
}
