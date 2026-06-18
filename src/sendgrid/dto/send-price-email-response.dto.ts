import { ApiProperty } from "@nestjs/swagger";

export class SendPriceEmailResponseDto {
  @ApiProperty({ example: true })
  sent: true;
}
