import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateOrderDeliveryPaymentDto {
  @ApiPropertyOptional({
    description:
      "Override COD amount. Defaults to `delivery_info.cashOnDeliveryAmount`.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({
    description: "Optional note for managers",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CreateOrderDeliveryPaymentResponseDto {
  @ApiProperty({
    description: "Created payment transaction id (also stored on delivery_info.payment_id)",
  })
  paymentId!: number;

  @ApiProperty()
  orderId!: number;

  @ApiProperty({
    enum: ["nova_poshta_payment"],
    description: "Payment type / method. Cannot be approved via manual confirm.",
  })
  method!: "nova_poshta_payment";

  @ApiProperty()
  amount!: number;

  @ApiProperty()
  currency!: string;

  @ApiProperty({
    description: "Created as `pending` until COD money is marked received",
  })
  status!: string;

  @ApiProperty({ enum: ["nova_poshta_payment"] })
  source!: "nova_poshta_payment";
}
