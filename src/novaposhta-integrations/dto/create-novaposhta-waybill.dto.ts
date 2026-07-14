import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Min,
  ValidateIf,
} from "class-validator";
import { NovaPoshtaPayerType } from "../../database/entities";

function pickNumberField(
  obj: Record<string, unknown>,
  snake: string,
  camel: string,
): number | null | undefined {
  const snakeValue = obj[snake];
  if (snakeValue !== undefined) {
    return snakeValue as number | null;
  }
  const camelValue = obj[camel];
  if (camelValue !== undefined) {
    return camelValue as number | null;
  }
  return undefined;
}

function pickPayerType(
  obj: Record<string, unknown>,
): NovaPoshtaPayerType | null | undefined {
  if (obj.payer_type !== undefined) {
    return obj.payer_type as NovaPoshtaPayerType | null;
  }
  if (obj.payerType !== undefined) {
    return obj.payerType as NovaPoshtaPayerType | null;
  }
  return undefined;
}

export class CreateNovaPoshtaWaybillRequestDto {
  @ApiPropertyOptional({
    nullable: true,
    description: "Parcel weight in kg (Вага). Falls back to integration default.",
    minimum: 0.1,
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Transform(({ obj }) =>
    pickNumberField(obj as Record<string, unknown>, "default_weight_kg", "defaultWeightKg"),
  )
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  default_weight_kg?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Parcel width in cm (Ширина).",
    minimum: 0.1,
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Transform(({ obj }) =>
    pickNumberField(obj as Record<string, unknown>, "default_width_cm", "defaultWidthCm"),
  )
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  default_width_cm?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Parcel height in cm (Висота).",
    minimum: 0.1,
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Transform(({ obj }) =>
    pickNumberField(obj as Record<string, unknown>, "default_height_cm", "defaultHeightCm"),
  )
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  default_height_cm?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Parcel length in cm (Довжина).",
    minimum: 0.1,
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Transform(({ obj }) =>
    pickNumberField(obj as Record<string, unknown>, "default_length_cm", "defaultLengthCm"),
  )
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  default_length_cm?: number | null;

  @ApiPropertyOptional({
    enum: NovaPoshtaPayerType,
    nullable: true,
    description:
      "Who pays delivery: `sender`, `recipient`, or `third_person`. Falls back to integration setting.",
  })
  @IsOptional()
  @Transform(({ obj }) => pickPayerType(obj as Record<string, unknown>))
  @ValidateIf((_, v) => v != null)
  @IsEnum(NovaPoshtaPayerType)
  payer_type?: NovaPoshtaPayerType | null;

  @ApiPropertyOptional({
    description: "Number of seats / places (defaults to 1).",
    minimum: 1,
    example: 1,
  })
  @IsOptional()
  @Transform(({ obj }) => {
    const record = obj as Record<string, unknown>;
    return record.seats_amount ?? record.seatsAmount;
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seats_amount?: number;
}

export class CreateNovaPoshtaWaybillResponseDto {
  @ApiProperty()
  orderId: number;

  @ApiProperty({ description: "Nova Poshta TTN (IntDocNumber)" })
  trackingNumber: string;

  @ApiProperty({ description: "Nova Poshta InternetDocument Ref" })
  documentRef: string;
}
