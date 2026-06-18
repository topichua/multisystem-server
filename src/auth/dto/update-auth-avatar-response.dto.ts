import { ApiProperty } from "@nestjs/swagger";

export class UpdateAuthAvatarResponseDto {
  @ApiProperty({
    description: "CDN URL of the uploaded avatar.",
    example: "https://imagedelivery.net/account/image-id/public",
  })
  avatar_src: string;
}
