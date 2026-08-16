import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { INTEGRATION_TYPES } from "../../integration-type";

export class CreateIntegrationRequestDto {
  @ApiProperty({
    enum: ["instagram", "tiktok"],
    description:
      "Channel to connect via OAuth. `instagram` uses Facebook Login by default (or Instagram Login when `auth_flow` is `instagram_login`); `tiktok` uses TikTok Login Kit.",
    example: "instagram",
  })
  @IsIn(["instagram", "tiktok"])
  integration_type: "instagram" | "tiktok";

  @ApiPropertyOptional({
    enum: ["facebook", "instagram_login"],
    description:
      "Instagram only. `facebook` (default) — Facebook Login + Page with Instagram Business account. " +
      "`instagram_login` — Instagram Login (no Facebook Page; graph.instagram.com).",
    default: "facebook",
  })
  @IsOptional()
  @IsIn(["facebook", "instagram_login"])
  auth_flow?: "facebook" | "instagram_login";
}
