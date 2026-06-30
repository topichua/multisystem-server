import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsString, MaxLength } from "class-validator";
import { NovaPoshtaCredentialsQueryDto } from "./novaposhta-credentials-query.dto";

export class SearchNovaPoshtaSettlementsQueryDto extends NovaPoshtaCredentialsQueryDto {
  @ApiProperty({
    description: "City or settlement name",
    example: "Хмель",
  })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() : String(value ?? "").trim(),
  )
  @IsString()
  @MaxLength(100)
  query: string;
}
