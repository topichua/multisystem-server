import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  Min,
  ValidateIf,
} from "class-validator";

function pickTakeFromOrder(obj: Record<string, unknown>): boolean | undefined {
  if (obj.takeFromOrder !== undefined) {
    return obj.takeFromOrder as boolean;
  }
  if (obj.take_from_order !== undefined) {
    return obj.take_from_order as boolean;
  }
  return undefined;
}

export class NovaPoshtaEstimatedDeliveryPriceDto {
  @ApiPropertyOptional({
    nullable: true,
    description: "Fixed declared parcel value (оціночна ціна) in order currency.",
    minimum: 0,
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixed?: number | null;

  @ApiPropertyOptional({
    description:
      "When true, use order total as declared value. When false, use `fixed`. " +
      "Also accepted as `take_from_order`. Defaults to `true` when omitted.",
    example: true,
    default: true,
  })
  @IsOptional()
  @Transform(({ obj }) => pickTakeFromOrder(obj as Record<string, unknown>))
  @IsBoolean()
  takeFromOrder?: boolean;
}

export class NovaPoshtaEstimatedDeliveryPriceResponseDto {
  @ApiPropertyOptional({ nullable: true })
  fixed: number | null;

  @ApiProperty()
  takeFromOrder: boolean;
}
