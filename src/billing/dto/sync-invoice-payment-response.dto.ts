import { ApiProperty } from "@nestjs/swagger";
import { InvoiceStatus } from "../../database/entities/invoice-status.enum";
import type { MonopayInvoiceStatus } from "../monopay/monopay.types";

export class SyncInvoicePaymentResponseDto {
  @ApiProperty()
  invoiceId: number;

  @ApiProperty({ example: "success" })
  providerStatus: MonopayInvoiceStatus | string;

  @ApiProperty({ enum: InvoiceStatus })
  localStatus: InvoiceStatus;

  @ApiProperty({
    description:
      "True when local invoice is paid and subscription was activated",
  })
  activated: boolean;

  @ApiProperty()
  message: string;
}
