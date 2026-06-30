import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateClientRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  first_name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  last_name?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  phone?: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Set to a new Instagram id, or null / empty string to clear the link. Mutually exclusive with `telegramUserId`.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  instagramUserId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Set to a Telegram user id, or null / empty string to clear the link. Mutually exclusive with `instagramUserId`.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  telegramUserId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    deprecated: true,
    description: "Alias for `instagramUserId`.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  instagramId?: string | null;
}
