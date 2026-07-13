import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { OrderDeliveryProvider } from "../../database/entities/order-delivery-provider.enum";

export class AddOrderDeliveryFromTrackingDto {
  @ApiProperty({
    enum: OrderDeliveryProvider,
    example: OrderDeliveryProvider.nova_poshta,
    description: "Delivery carrier. Tracking lookup is supported for `nova_poshta`.",
  })
  @IsEnum(OrderDeliveryProvider)
  provider!: OrderDeliveryProvider;

  @ApiProperty({
    example: "20450123456789",
    description: "Carrier tracking number (TTN for Nova Poshta).",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @Matches(/^\d+$/, { message: "trackingNumber must contain only digits" })
  trackingNumber!: string;

  @ApiPropertyOptional({
    description:
      "Nova Poshta integration id in this workspace. Defaults to the first configured integration.",
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  providerId?: number | null;

  @ApiPropertyOptional({
    description:
      "Recipient phone for carrier tracking lookup. Defaults to the order customer phone.",
    example: "0501234567",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string | null;
}
