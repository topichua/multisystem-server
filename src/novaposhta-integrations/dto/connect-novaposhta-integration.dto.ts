import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ConnectNovaPoshtaIntegrationRequestDto {
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

  @ApiProperty({ description: "API key is stored; full value is never returned." })
  apiKeyConfigured: true;
}
