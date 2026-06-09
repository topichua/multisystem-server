import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export class CreateProductInstagramReferenceDto {
  @ApiPropertyOptional({
    description:
      "Instagram Business Account id (Graph `instagram_business_account.id`). " +
      "Stored independently of the integration row so references survive disconnect. " +
      "Required unless `instagram_account_id` is set.",
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @MaxLength(255)
  businessAccountId?: string;

  @ApiPropertyOptional({
    description: "Alias for `businessAccountId`.",
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @MaxLength(255)
  instagram_account_id?: string;

  @ApiProperty({
    description: "Instagram Graph media / post id.",
  })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsNotEmpty()
  @MaxLength(255)
  postId: string;

  @ApiPropertyOptional({
    description:
      "Bind this reference to a product variant. Create one row per variant when multiple variants share the same post.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productVariantId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  permalink?: string;
}
