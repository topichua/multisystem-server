import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class ConfirmTelegramCodeRequestDto {
  @ApiProperty({ description: "Login code from the Telegram app or SMS" })
  @IsString()
  @Matches(/^\d{4,8}$/, { message: "code must be 4–8 digits" })
  code: string;
}
