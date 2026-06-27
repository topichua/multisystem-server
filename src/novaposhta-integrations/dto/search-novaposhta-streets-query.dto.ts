import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { NovaPoshtaApiKeyQueryDto } from "./novaposhta-api-key-query.dto";

export class SearchNovaPoshtaStreetsQueryDto extends NovaPoshtaApiKeyQueryDto {
  @ApiProperty({
    description: "Settlement reference from settlement search (`ref` field)",
    example: "00000000-0000-0000-0000-000000000000",
  })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() : String(value ?? "").trim(),
  )
  @IsString()
  @MinLength(1)
  @IsUUID("all")
  settlementRef: string;

  @ApiProperty({
    description: "Street name",
    example: "Бандери",
  })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() : String(value ?? "").trim(),
  )
  @IsString()
  @MaxLength(100)
  query: string;
}
