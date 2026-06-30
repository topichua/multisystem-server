import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class CreateClientRequestDto {
  @ApiPropertyOptional({
    description: "Optional; stored as empty string if omitted.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  first_name?: string;

  @ApiPropertyOptional({
    description: "Optional; stored as empty string if omitted.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  last_name?: string;

  @ApiPropertyOptional({
    description: "Optional; stored as empty string if omitted.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Instagram scoped user id (`instagram_users.id`). Omit or null for no Instagram link. " +
      "Mutually exclusive with `telegramUserId`.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  instagramUserId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "Telegram user id (`telegram_users.id`). Omit or null for no Telegram link. " +
      "Mutually exclusive with `instagramUserId`.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  telegramUserId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    deprecated: true,
    description: "Alias for `instagramUserId` (kept for backward compatibility).",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  instagramId?: string | null;
}
