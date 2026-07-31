import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { INTEGRATION_TYPES } from "../../integration-type";

export class CreateIntegrationRequestDto {
  @ApiProperty({
    enum: ["instagram", "tiktok"],
    description:
      "Channel to connect via OAuth. `instagram` uses Facebook Login; `tiktok` uses TikTok Login Kit.",
    example: "instagram",
  })
  @IsIn(["instagram", "tiktok"])
  integration_type: "instagram" | "tiktok";
}
