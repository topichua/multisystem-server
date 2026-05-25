import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class ConfirmTelegramPasswordRequestDto {
  @ApiProperty({ description: "Telegram cloud 2FA password" })
  @IsString()
  @MinLength(1)
  password: string;
}
