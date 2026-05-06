import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { ProductSourceReferenceType } from "../../database/entities/product-source-reference-type.enum";

export class CreateProductSourceReferenceDto {
  @ApiProperty({ enum: ProductSourceReferenceType })
  @IsEnum(ProductSourceReferenceType)
  sourceType: ProductSourceReferenceType;

  @ApiProperty()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(255)
  sourceId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  permalink?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  caption?: string;
}
