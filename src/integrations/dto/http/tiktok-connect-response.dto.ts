import { ApiProperty } from "@nestjs/swagger";

export class TikTokConnectResponseDto {
  @ApiProperty({
    description: "TikTok OAuth v2 authorize URL; open in browser or popup",
    example:
      "https://www.tiktok.com/v2/auth/authorize/?client_key=…&response_type=code&scope=user.info.basic&redirect_uri=…&state=…",
  })
  authorizationUrl!: string;
}
