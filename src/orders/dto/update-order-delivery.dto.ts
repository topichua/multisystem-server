import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { OrderDeliveryProvider } from "../../database/entities/order-delivery-provider.enum";

export class UpdateOrderDeliveryDto {
  @ApiProperty({ enum: OrderDeliveryProvider })
  @IsEnum(OrderDeliveryProvider)
  provider: OrderDeliveryProvider;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string | null;

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
