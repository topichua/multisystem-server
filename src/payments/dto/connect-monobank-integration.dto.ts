import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";

export class ConnectMonobankIntegrationDto {
  @ApiProperty({ description: "Monobank Acquiring merchant token (X-Token)" })
  @IsString()
  @MinLength(8)
  merchantToken!: string;

  @ApiPropertyOptional({
    description: "Display name shown in workspace settings",
  })
  @IsOptional()
  @IsString()
  displayName?: string;
}

export class UpdateMonobankIntegrationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  merchantToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;
}
