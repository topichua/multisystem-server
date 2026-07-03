import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ConversationChannelCriteriaItemDto {
  @ApiProperty({
    description: "Integration id (Instagram or Telegram row id in this workspace).",
  })
  integrationId: number;

  @ApiProperty({
    description: "Display name for the channel (page name, @username, or bot name).",
  })
  name: string;

  @ApiProperty({ enum: ["instagram", "telegram"] })
  type: "instagram" | "telegram";
}

export class ConversationResponsibleUserCriteriaItemDto {
  @ApiProperty({
    description:
      "Workspace member id (matches conversation `responsible_member_id`).",
  })
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional({ nullable: true })
  avatar: string | null;
}

export class ConversationChannelCriteriaResponseDto {
  @ApiProperty({ type: [ConversationChannelCriteriaItemDto] })
  channels: ConversationChannelCriteriaItemDto[];

  @ApiProperty({
    type: [ConversationResponsibleUserCriteriaItemDto],
    description:
      "Distinct responsible members on conversations you can access (for responsible filter).",
  })
  responsibleUsers: ConversationResponsibleUserCriteriaItemDto[];
}
