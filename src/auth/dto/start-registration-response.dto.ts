import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class StartRegistrationResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiPropertyOptional({
    description:
      "Non-production only. Full confirmation URL with the raw token (use the `token` query param, not `token_hash` from DB).",
  })
  confirmUrl?: string;
}
