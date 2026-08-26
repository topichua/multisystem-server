import { ApiProperty } from "@nestjs/swagger";

export class UpdateAuthAvatarResponseDto {
  @ApiProperty({
    description:
      "CDN URL of the avatar after upload, or `null` after delete.",
    example: "https://imagedelivery.net/account/image-id/public",
    nullable: true,
  })
  avatar_src: string | null;
}
