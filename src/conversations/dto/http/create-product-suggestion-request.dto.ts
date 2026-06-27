import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateProductSuggestionRequestDto {
  @ApiProperty({ description: "Conversation database id" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  conversationId: number;

  @ApiProperty({ description: "Product id to suggest" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId: number;

  @ApiPropertyOptional({
    nullable: true,
    description: "Optional variant id; must belong to productId",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productVariantId?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Instagram post / media id the suggestion is linked to",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === null || value === undefined) return null;
    const trimmed = typeof value === "string" ? value.trim() : String(value).trim();
    return trimmed || null;
  })
  @IsString()
  @MaxLength(255)
  postId?: string | null;
}
