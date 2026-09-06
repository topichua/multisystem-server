import { ApiProperty } from "@nestjs/swagger";

export class MarkConversationPostCommentsReadResponseDto {
  @ApiProperty({ description: "ISO 8601 timestamp written to `read_at`." })
  read_at: string;

  @ApiProperty({
    description:
      "Number of `conversation_messages` rows updated for this conversation and post.",
  })
  updated: number;
}
