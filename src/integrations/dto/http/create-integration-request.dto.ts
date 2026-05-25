import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { INTEGRATION_TYPES } from "../../integration-type";

export class CreateIntegrationRequestDto {
  @ApiProperty({
    enum: ["instagram"],
    description: "Channel to connect. Only `instagram` is supported today.",
    example: "instagram",
  })
  @IsIn(["instagram"])
  integration_type: "instagram";
}
