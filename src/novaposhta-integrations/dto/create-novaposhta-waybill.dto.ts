import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateNovaPoshtaWaybillRequestDto {
  @ApiPropertyOptional({
    description: "Override cargo weight in grams (defaults to sum of product weights or 1000 g).",
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weightGrams?: number;

  @ApiPropertyOptional({
    description: "Number of seats / places (defaults to 1).",
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seatsAmount?: number;

  @ApiPropertyOptional({
    description: "Cargo description (defaults to order item titles).",
    maxLength: 512,
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @ApiPropertyOptional({
    description: "Declared value in order currency (defaults to order total).",
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  declaredCost?: number;
}

export class CreateNovaPoshtaWaybillResponseDto {
  @ApiProperty()
  orderId: number;

  @ApiProperty({ description: "Nova Poshta TTN (IntDocNumber)" })
  trackingNumber: string;

  @ApiProperty({ description: "Nova Poshta InternetDocument Ref" })
  documentRef: string;
}
