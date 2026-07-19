import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ConversationSource } from "../../../database/entities";

export class ConversationParticipantDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  profilePic: string;

  @ApiProperty({
    description:
      "E.164 phone when known (Telegram participant only). Empty string when not available.",
    example: "+380501234567",
  })
  phone: string;
}

export class ConversationRowDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  instUpdatedAt: Date;

  @ApiProperty({
    description:
      "True when the latest message is from the participant (not your account) and is newer than `read_at` on this conversation, or you have never opened the thread (`read_at` null). Updated when you GET conversation messages.",
  })
  isUnread: boolean;

  @ApiProperty({ enum: ConversationSource })
  source: ConversationSource;

  @ApiPropertyOptional({ nullable: true })
  groupId: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Assigned workspace member id",
  })
  responsibleMemberId: number | null;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    format: "date-time",
    description: "When `responsibleMemberId` was last set",
  })
  responsibleMemberSetAt: Date | null;

  @ApiProperty()
  lastMessage: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      "True when the latest message was sent by my connected account; false when sent by participant; null when unknown.",
  })
  isLastMessageFromMe: boolean | null;

  @ApiPropertyOptional({
    type: ConversationParticipantDto,
    nullable: true,
    description:
      "Profile of the participant opposite to the current account in this conversation.",
  })
  participant: ConversationParticipantDto | null;

  @ApiProperty({
    description:
      "True when the chat is unassigned and the user may take it (assign themselves as responsible). Messages are not available until taken.",
  })
  canTakeChat: boolean;

  @ApiProperty({
    description:
      "True when the user may assign or change responsible member on this conversation (grant `assignResponsibility` or owner / conversations.full_access).",
  })
  canAssignResponsible: boolean;
}

export class ConversationsListCountersDto {
  @ApiProperty({
    description:
      "Total accessible conversations matching shared filters (groupIds/grouping_*, channel_ids, keyword). " +
      "When `groupIds` and status `grouping_id` are omitted, archived and spam are excluded. " +
      "Excludes list-only filters (unread_only, responsible_user_ids, show_without_responsible_only).",
  })
  total: number;

  @ApiProperty({
    description:
      "Subset of `total` where `isUnread` is true (same rules as list item payload).",
  })
  unread: number;

  @ApiProperty({
    description: "Subset of `total` where `responsibleMemberId` is null.",
  })
  withoutResponsible: number;
}

export class ConversationsListResponseDto {
  @ApiProperty({ type: [ConversationRowDto] })
  items: ConversationRowDto[];

  @ApiProperty({ type: ConversationsListCountersDto })
  counters: ConversationsListCountersDto;
}
