import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ClientLinkProvider } from "../../database/entities/client-link-provider.enum";

export class AddClientLinkRequestDto {
  @ApiProperty({
    enum: ClientLinkProvider,
    example: ClientLinkProvider.TELEGRAM,
    description: "Social platform for `externalId`.",
  })
  @IsEnum(ClientLinkProvider)
  provider: ClientLinkProvider;

  @ApiPropertyOptional({
    example: "123456789",
    description:
      "Telegram user id or Instagram scoped user id (`client_links.external_id`).",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  externalId?: string;

  @ApiPropertyOptional({
    deprecated: true,
    description: "Deprecated alias for `externalId` when linking Instagram.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  instagramId?: string;

  @ApiPropertyOptional({
    deprecated: true,
    description: "Deprecated alias for `externalId` when linking Instagram.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  instagramUserId?: string;

  @ApiPropertyOptional({
    deprecated: true,
    description: "Deprecated alias for `externalId` when linking Telegram.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  telegramUserId?: string;

  resolvedExternalId(): string {
    const fromField = this.externalId?.trim();
    if (fromField) {
      return fromField;
    }
    if (this.provider === ClientLinkProvider.INSTAGRAM) {
      const ig = (this.instagramUserId ?? this.instagramId)?.trim();
      if (ig) return ig;
    }
    if (this.provider === ClientLinkProvider.TELEGRAM) {
      const tg = this.telegramUserId?.trim();
      if (tg) return tg;
    }
    return "";
  }
}
