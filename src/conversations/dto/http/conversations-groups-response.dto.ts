import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ConversationGroupingBy } from "./conversation-grouping-by.enum";

export class ConversationGroupChannelMetaDto {
  @ApiProperty({ example: 1 })
  integrationId!: number;

  @ApiProperty({ enum: ["instagram", "telegram"], example: "instagram" })
  type!: "instagram" | "telegram";

  @ApiProperty({ example: "My Instagram" })
  name!: string;
}

export class ConversationGroupBucketMetaDto {
  @ApiPropertyOptional({
    nullable: true,
    description: "Workspace member id when `by=responsible`.",
  })
  responsibleMemberId?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Conversation group id when `by=status`.",
  })
  groupId?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "System conversation group key when `by=status`.",
  })
  systemKey?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Conversation group color when `by=status`.",
  })
  color?: string | null;

  @ApiPropertyOptional({
    enum: ["today", "last_week", "last_month", "long_ago"],
    description: "Creation-time bucket when `by=createdAt`.",
  })
  createdAtBucket?: "today" | "last_week" | "last_month" | "long_ago";

  @ApiPropertyOptional({ type: ConversationGroupChannelMetaDto })
  channel?: ConversationGroupChannelMetaDto;
}

export class ConversationGroupBucketItemDto {
  @ApiProperty({
    description:
      "Stable key for this bucket. Pass as `grouping_id` with matching `grouping_by` on GET /conversations. " +
      "Conversation-group ids can still be filtered with `groupIds`.",
    example: "12",
  })
  key!: string;

  @ApiProperty({ example: "Ivan Petrenko" })
  label!: string;

  @ApiProperty({ example: 5 })
  count!: number;

  @ApiProperty({ type: ConversationGroupBucketMetaDto })
  meta!: ConversationGroupBucketMetaDto;
}

export class ConversationsGroupsResponseDto {
  @ApiProperty({ enum: ConversationGroupingBy })
  by!: ConversationGroupingBy;

  @ApiProperty({
    description: "Sum of `items[].count` for the current grouping.",
    example: 42,
  })
  total!: number;

  @ApiProperty({ type: [ConversationGroupBucketItemDto] })
  items!: ConversationGroupBucketItemDto[];
}
