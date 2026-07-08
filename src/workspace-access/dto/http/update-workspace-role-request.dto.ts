import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class UpdateWorkspaceRoleRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Hex or CSS color; pass null or empty string to clear.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  color?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional({
    example: { "orders.visibility": "all" },
    description: "Option permissions from GET /permissions/catalog.",
  })
  @IsOptional()
  @IsObject()
  permissionOptions?: Record<string, string>;

  @ApiPropertyOptional({
    example: 20,
    description: "Maximum percentage discount that members with this role may apply to an order.",
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  maxOrderDiscountPercentage?: number;

  @ApiPropertyOptional({
    example: { "conversations.sources": ["instagram", "telegram"] },
  })
  @IsOptional()
  @IsObject()
  permissionOptionLists?: Record<string, string[]>;
}
