import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, Max, Min } from "class-validator";

export class AddOrderItemDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  variantId: number;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ minimum: 0, description: "Fixed discount amount for this item." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, description: "Percent discount for this item." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number;
}
