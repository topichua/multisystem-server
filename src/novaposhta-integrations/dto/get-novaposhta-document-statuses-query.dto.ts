import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsString, MinLength, MaxLength, Matches } from "class-validator";
import { NovaPoshtaCredentialsQueryDto } from "./novaposhta-credentials-query.dto";

export class GetNovaPoshtaDocumentStatusesQueryDto extends NovaPoshtaCredentialsQueryDto {
  @ApiProperty({
    description: "Nova Poshta document number (TTN).",
    example: "12345678901234",
  })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() : String(value ?? "").trim(),
  )
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[0-9]+$/, {
    message: "document_number must contain only digits",
  })
  document_number: string;

  @ApiProperty({
    description: "Recipient phone number used for Nova Poshta tracking.",
    example: "+380501234567",
  })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim() : String(value ?? "").trim(),
  )
  @IsString()
  @MinLength(7)
  @MaxLength(32)
  phone: string;
}
