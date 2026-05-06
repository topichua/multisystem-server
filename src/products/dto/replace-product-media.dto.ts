import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { ProductMediaType } from "../../database/entities/product-media-type.enum";

export class ReplaceProductMediaItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  url: string;

  @ApiProperty({ enum: ProductMediaType })
  @IsEnum(ProductMediaType)
  type: ProductMediaType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  sourceUrl?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class ReplaceProductMediaRequestDto {
  @ApiProperty({ type: [ReplaceProductMediaItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReplaceProductMediaItemDto)
  items: ReplaceProductMediaItemDto[];
}
