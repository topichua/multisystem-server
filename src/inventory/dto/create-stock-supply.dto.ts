import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class CreateStockSupplyItemDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  productId: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  productVariantId: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  buyPrice: number;
}

export class CreateStockSupplyDto {
  @ApiProperty({
    description: "Display name of the supply batch.",
    example: "Поставка 01.08",
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  @MinLength(1)
  name: string;

  @ApiProperty({ type: [CreateStockSupplyItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateStockSupplyItemDto)
  items: CreateStockSupplyItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiProperty({
    description:
      "When true, applies the supply immediately (creates stock movements). " +
      "When false, creates a pending supply that can be edited and applied later.",
    default: false,
  })
  @IsBoolean()
  immediatelyApply: boolean;
}
