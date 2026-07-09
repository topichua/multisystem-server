import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ForgotPasswordResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiPropertyOptional({
    description: "Returned only outside production for local testing.",
  })
  resetUrl?: string;
}
