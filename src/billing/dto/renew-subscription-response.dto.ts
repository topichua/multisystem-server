import { ApiProperty } from "@nestjs/swagger";
import { InvoiceDetailResponseDto } from "./invoice-detail-response.dto";

export class RenewSubscriptionResponseDto {
  @ApiProperty({ type: InvoiceDetailResponseDto })
  invoice: InvoiceDetailResponseDto;

  @ApiProperty({
    example:
      "Renewal invoice created. Pay manually to extend the subscription period.",
  })
  message: string;
}
