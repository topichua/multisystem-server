import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";

export class NovaPoshtaApiKeyQueryDto {
  @ApiProperty({
    description:
      "Nova Poshta API key. Used during integration setup; a stored integration is not required.",
  })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() : String(value ?? "").trim(),
  )
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  api_key: string;
}
