import { ApiProperty } from "@nestjs/swagger";

export type ConversationMessageReactionFrom = "sender" | "receiver";

export class ConversationMessageReactionDto {
  @ApiProperty({ example: "👍" })
  reaction: string;

  @ApiProperty({
    description: "When the reaction was added, ISO 8601",
    example: "2026-07-06T12:00:00.000Z",
  })
  at: string;

  @ApiProperty({ enum: ["sender", "receiver"] })
  from: ConversationMessageReactionFrom;
}
