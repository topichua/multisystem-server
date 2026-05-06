import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateCategoryRequestDto {
  @ApiProperty({ description: 'Category name (1–80 characters after trim).', maxLength: 80 })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({
    description: 'Parent category id. Omit or null for a top-level category.',
    example: 1,
  })
  @IsOptional()
  @ValidateIf((o) => o.parentId !== undefined && o.parentId !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parentId?: number | null;

  @ApiPropertyOptional({ description: 'Sort order within siblings; default 0.', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
