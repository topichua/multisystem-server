import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { OrderDeliveryDestinationType } from "../../database/entities/order-delivery-destination-type.enum";
import { OrderDeliveryProvider } from "../../database/entities/order-delivery-provider.enum";
import { OrderDeliveryStatus } from "../../database/entities/order-delivery-status.enum";

export class UpdateOrderDeliveryDto {
  @ApiProperty({ enum: OrderDeliveryProvider })
  @IsEnum(OrderDeliveryProvider)
  provider: OrderDeliveryProvider;

  @ApiPropertyOptional({
    description:
      "Integration id for the delivery provider (e.g. Nova Poshta integration id). Stored without FK.",
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  providerId?: number | null;

  @ApiPropertyOptional({
    enum: OrderDeliveryStatus,
    default: OrderDeliveryStatus.pending,
    description:
      "Delivery lifecycle status. Use providerStatusCode/providerStatusText for Nova Poshta tracking details.",
  })
  @IsOptional()
  @IsEnum(OrderDeliveryStatus)
  deliveryStatus?: OrderDeliveryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  recipientName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  city?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cityRef?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  warehouse?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  warehouseRef?: string | null;

  @ApiPropertyOptional({ enum: OrderDeliveryDestinationType })
  @IsOptional()
  @IsEnum(OrderDeliveryDestinationType)
  deliveryType?: OrderDeliveryDestinationType | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  street?: string | null;

  @ApiPropertyOptional({
    description: "Settlement street Ref from Nova Poshta street search.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  streetRef?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  building?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  flat?: string | null;

  @ApiPropertyOptional({ description: "Nova Poshta TTN / tracking number." })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  trackingNumber?: string | null;

  @ApiPropertyOptional({
    description:
      "Carrier-specific status code, e.g. Nova Poshta TrackingDocument StatusCode (7 = at branch).",
    example: "7",
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  providerStatusCode?: string | null;

  @ApiPropertyOptional({
    description:
      "Human-readable carrier status, e.g. «Прибув на відділення».",
    example: "Прибув на відділення",
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  providerStatusText?: string | null;

  @ApiPropertyOptional({
    description: "Nova Poshta InternetDocument Ref after waybill creation.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  providerDocumentRef?: string | null;

  @ApiPropertyOptional({
    description:
      "Whether the recipient pays on delivery (наложений платіж). When false, order is prepaid.",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isCashOnDelivery?: boolean;

  @ApiPropertyOptional({
    description:
      "Cash-on-delivery amount in order currency (грн). Required when isCashOnDelivery is true.",
    example: 1650,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((o) => o.isCashOnDelivery === true)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cashOnDeliveryAmount?: number | null;
}
