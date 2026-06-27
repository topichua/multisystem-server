import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { NovaPoshtaSenderSettingsDto } from "./novaposhta-sender-settings.dto";

export class ConnectNovaPoshtaIntegrationRequestDto extends NovaPoshtaSenderSettingsDto {
  @ApiProperty({ description: "Nova Poshta API key" })
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  api_key: string;

  @ApiPropertyOptional({ example: "Nova Poshta" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;
}

export class NovaPoshtaIntegrationResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  workspaceId: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  connectedAt: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiProperty({ description: "API key is stored; full value is never returned." })
  apiKeyConfigured: true;

  @ApiPropertyOptional({ nullable: true })
  sender_name: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_phone: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_city_ref: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_city_name: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_type: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_warehouse_ref: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_warehouse_name: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_street_ref: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_street_name: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_building: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_flat: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_ref: string | null;

  @ApiPropertyOptional({ nullable: true })
  sender_contact_ref: string | null;

  @ApiPropertyOptional({ nullable: true })
  payment_method: string | null;

  @ApiPropertyOptional({ nullable: true })
  payer_type: string | null;
}
