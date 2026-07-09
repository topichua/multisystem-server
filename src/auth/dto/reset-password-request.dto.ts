import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class ResetPasswordRequestDto {
  @ApiProperty({
    description: "Raw token from the reset email link (?token=…).",
  })
  @IsString()
  @MinLength(1)
  token: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
