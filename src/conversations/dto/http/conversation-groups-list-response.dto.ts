import { ApiProperty } from "@nestjs/swagger";
import { ConversationGroupResponseDto } from "./conversation-group-response.dto";

export class ConversationGroupsListResponseDto {
  @ApiProperty({ type: [ConversationGroupResponseDto] })
  items: ConversationGroupResponseDto[];
}
