import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { AddOrderItemDto } from "./add-order-item.dto";

export class UpdateOrderDto {
  @ApiPropertyOptional({
    type: () => [AddOrderItemDto],
    description:
      "Replace all line items. Allowed only while order status category is `new`.",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddOrderItemDto)
  items?: AddOrderItemDto[];

  @ApiPropertyOptional({ minimum: 0, description: "Fixed discount amount applied to the whole order." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, description: "Percent discount applied to the whole order." })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercent?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  customerNote?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  internalNote?: string | null;
}
