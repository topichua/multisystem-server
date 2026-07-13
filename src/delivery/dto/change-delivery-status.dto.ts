import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { OrderDeliveryStatus } from "../../database/entities/order-delivery-status.enum";

export class ChangeDeliveryStatusDto {
  @ApiProperty({ enum: OrderDeliveryStatus })
  @IsEnum(OrderDeliveryStatus)
  deliveryStatus!: OrderDeliveryStatus;

  @ApiPropertyOptional({
    description:
      "Carrier-specific status code, e.g. Nova Poshta TrackingDocument StatusCode.",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  providerStatusCode?: string | null;

  @ApiPropertyOptional({
    description: "Human-readable carrier status text.",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  providerStatusText?: string | null;
}

export class ChangeDeliveryStatusResultDto {
  @ApiProperty()
  deliveryId!: number;

  @ApiProperty()
  orderId!: number;

  @ApiProperty({ enum: OrderDeliveryStatus })
  previousStatus!: OrderDeliveryStatus;

  @ApiProperty({ enum: OrderDeliveryStatus })
  newStatus!: OrderDeliveryStatus;

  @ApiProperty()
  changed!: boolean;

  @ApiPropertyOptional({ nullable: true })
  statusChangedAt!: Date | null;
}
