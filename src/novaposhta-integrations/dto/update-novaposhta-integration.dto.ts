import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { NovaPoshtaSenderSettingsDto } from "./novaposhta-sender-settings.dto";

export class UpdateNovaPoshtaIntegrationRequestDto extends NovaPoshtaSenderSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  api_key?: string;

  @ApiPropertyOptional({ example: "Nova Poshta" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;
}
