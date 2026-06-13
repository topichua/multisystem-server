import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class ChangePasswordRequestDto {
  @ApiProperty({ minLength: 1, description: "Current account password" })
  @IsString()
  @MinLength(1)
  existing_password: string;

  @ApiProperty({ minLength: 8, description: "New password (min 8 characters)" })
  @IsString()
  @MinLength(8)
  new_password: string;
}
