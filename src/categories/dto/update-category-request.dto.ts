import { ApiPropertyOptional } from '@nestjs/swagger';
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

export class UpdateCategoryRequestDto {
  @ApiPropertyOptional({ description: 'Category name (1–80 characters after trim).', maxLength: 80 })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({
    description: 'Set to null to make a top-level category; omit to leave unchanged.',
    example: 2,
  })
  @IsOptional()
  @ValidateIf((o) => o.parentId !== undefined && o.parentId !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parentId?: number | null;

  @ApiPropertyOptional({ description: 'Sort order within siblings.', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
