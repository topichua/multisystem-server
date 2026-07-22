import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class ReviewOrderRefundDto {
  @ApiPropertyOptional({ description: "Optional review note" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
