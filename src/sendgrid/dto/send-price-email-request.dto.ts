import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class SendPriceEmailRequestDto {
  @ApiProperty({ example: "customer@example.com" })
  @IsEmail()
  to: string;

  @ApiProperty({
    example: "$49.99",
    description: "Value for the SendGrid template `price` variable.",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  price: string;
}
