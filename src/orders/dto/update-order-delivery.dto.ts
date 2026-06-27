import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { OrderDeliveryDestinationType } from "../../database/entities/order-delivery-destination-type.enum";
import { OrderDeliveryProvider } from "../../database/entities/order-delivery-provider.enum";

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  trackingNumber?: string | null;

  @ApiPropertyOptional({
    description: "Opaque provider response / webhook body",
  })
  @IsOptional()
  rawProviderPayload?: Record<string, unknown> | null;
}
