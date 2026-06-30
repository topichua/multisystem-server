import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

export class NovaPoshtaCredentialsQueryDto {
  @ApiPropertyOptional({
    description:
      "Nova Poshta API key. Use during integration setup before an integration row exists.",
  })
  @ValidateIf((o) => o.nova_poshta_integration_id == null)
  @Transform(({ value }) => {
    if (value == null || value === "") {
      return undefined;
    }
    const trimmed =
      typeof value === "string" ? value.trim() : String(value).trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  api_key?: string;

  @ApiPropertyOptional({
    description:
      "Stored Nova Poshta integration id. Server loads the API key from the database (preferred for clients).",
    minimum: 1,
  })
  @ValidateIf((o) => !o.api_key?.trim())
  @Type(() => Number)
  @IsInt()
  @Min(1)
  nova_poshta_integration_id?: number;
}
