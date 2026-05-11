import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class UpdateOrderStatusDto {
  @ApiProperty({ description: "Custom order status id in this workspace" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  statusId: number;
}
