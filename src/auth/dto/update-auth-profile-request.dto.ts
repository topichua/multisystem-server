import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export class UpdateAuthProfileRequestDto {
  @ApiPropertyOptional({ example: "Alex" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName?: string;

  @ApiPropertyOptional({ nullable: true, example: "Smith" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(120)
  lastName?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "+380501234567",
    description:
      "Mobile phone. Stored as a hash only; pass null or empty string to clear.",
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(32)
  phone?: string | null;
}
