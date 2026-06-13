import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";

export class SetEmailRequestDto {
  @ApiProperty({ example: "new-address@example.com" })
  @IsEmail()
  new_email: string;

  @ApiProperty({ minLength: 1, description: "Current account password" })
  @IsString()
  @MinLength(1)
  existing_password: string;
}
