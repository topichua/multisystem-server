import { ApiProperty } from "@nestjs/swagger";

export class StartRegistrationResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({
    description:
      "Confirmation URL with the raw token (use the `token` query param). " +
      "Always returned, including when the confirmation email fails to send.",
    example: "https://app.example.com/register/confirm?token=…",
  })
  confirmUrl: string;
}
