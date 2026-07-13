import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export type ConversationMessageAttachmentType =
  | "image"
  | "video"
  | "audio"
  | "file";

export class ConversationMessageAttachmentDto {
  @ApiProperty({ enum: ["image", "video", "audio", "file"] })
  type: ConversationMessageAttachmentType;

  @ApiProperty({
    description: "Storage key: Cloudflare Images id for images",
  })
  key: string;

  @ApiPropertyOptional({
    description: "Cloudflare R2 object key for video/audio/file attachments",
  })
  r2_key?: string;

  @ApiProperty({ description: "Public URL for the stored object" })
  url: string;

  @ApiProperty({
    description: "When the attachment was stored, ISO 8601",
    example: "2026-07-06T12:00:00.000Z",
  })
  at: string;

  @ApiProperty()
  name: string;
}

export class ConversationMessageAttachmentsDto {
  @ApiProperty({ type: () => [ConversationMessageAttachmentDto] })
  data: ConversationMessageAttachmentDto[];
}
