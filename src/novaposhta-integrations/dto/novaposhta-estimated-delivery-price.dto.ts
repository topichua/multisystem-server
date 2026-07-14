import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  Min,
  ValidateIf,
} from "class-validator";

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

  @ApiProperty({
    description:
      "When true, use order total as declared value. When false, use `fixed`.",
    example: true,
  })
  @IsBoolean()
  takeFromOrder!: boolean;
}

export class NovaPoshtaEstimatedDeliveryPriceResponseDto {
  @ApiPropertyOptional({ nullable: true })
  fixed: number | null;

  @ApiProperty()
  takeFromOrder: boolean;
}
