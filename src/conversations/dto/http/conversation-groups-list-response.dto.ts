import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ConversationGroupResponseDto } from "./conversation-group-response.dto";

export class ConversationGroupsListResponseDto {
  @ApiProperty({ type: [ConversationGroupResponseDto] })
  items: ConversationGroupResponseDto[];

  @ApiPropertyOptional({
    description:
      "Total accessible conversations across active groups (with `include_distribution=true`). " +
      "Excludes archived and spam; includes chats with no group (`group_id` null) in the total.",
  })
  totalConversations?: number;
}
