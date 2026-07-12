import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class NovaPoshtaTrackingDocumentDto {
  @ApiPropertyOptional({ description: "Tracking document number." })
  Number?: string | null;

  @ApiPropertyOptional({ description: "Current status text returned by Nova Poshta." })
  Status?: string | null;

  @ApiProperty({ description: "Current status code returned by Nova Poshta." })
  StatusCode: string;

  @ApiPropertyOptional({ description: "Recipient warehouse name." })
  WarehouseRecipient?: string | null;

  @ApiPropertyOptional({ description: "Sender warehouse name." })
  WarehouseSender?: string | null;

  @ApiPropertyOptional({ description: "Document creation date/time." })
  DateCreated?: string | null;

  @ApiPropertyOptional({ description: "Last scan date/time." })
  DateScan?: string | null;

  @ApiPropertyOptional({ description: "Date/time the document was received." })
  DateReceived?: string | null;

  @ApiPropertyOptional({ description: "Recipient planned delivery date/time." })
  RecipientDateTime?: string | null;

  @ApiPropertyOptional({ description: "Full name of the recipient." })
  RecipientFullName?: string | null;

  @ApiPropertyOptional({ description: "Recipient city." })
  CityRecipient?: string | null;

  @ApiPropertyOptional({ description: "Sender city." })
  CitySender?: string | null;

  @ApiPropertyOptional({ description: "Redelivery status." })
  Redelivery?: string | null;

  @ApiPropertyOptional({ description: "Scheduled delivery date." })
  ScheduledDeliveryDate?: string | null;
}
