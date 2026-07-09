import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsOptional,
  Min,
} from "class-validator";

export class AddClientWishlistRequestDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  variantId: number;

  @ApiPropertyOptional({
    description: "When the wish was expressed. Defaults to server time.",
  })
  @IsOptional()
  @IsDateString()
  at?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: "Optional conversation context. Stored without FK.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  conversationId?: number | null;
}
