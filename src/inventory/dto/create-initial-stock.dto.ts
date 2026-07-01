import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateInitialStockDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  variantId: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ minimum: 0 })
  @IsNumber()
  @Min(0)
  purchasePrice: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}
