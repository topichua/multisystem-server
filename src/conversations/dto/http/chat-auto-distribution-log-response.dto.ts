import { ApiProperty } from "@nestjs/swagger";

export class ChatAutoDistributionLogChannelSummaryDto {
  @ApiProperty({ enum: ["instagram", "telegram"] })
  integrationType: "instagram" | "telegram";

  @ApiProperty()
  integrationId: number;

  @ApiProperty({ description: "Channel display name when known." })
  channelName: string;

  @ApiProperty({ description: "Number of chats auto-distributed on this channel." })
  count: number;
}

export class ChatAutoDistributionLogMemberSummaryDto {
  @ApiProperty({ description: "workspace_members.id" })
  memberId: number;

  @ApiProperty()
  userId: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ description: "Number of chats auto-distributed to this member." })
  count: number;
}

export class ChatAutoDistributionLogChannelMemberSummaryDto {
  @ApiProperty({ enum: ["instagram", "telegram"] })
  integrationType: "instagram" | "telegram";

  @ApiProperty()
  integrationId: number;

  @ApiProperty()
  channelName: string;

  @ApiProperty({ description: "workspace_members.id" })
  memberId: number;

  @ApiProperty()
  userId: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty({
    description: "Chats distributed to this member on this channel.",
  })
  count: number;
}

export class ChatAutoDistributionLogItemDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  conversationId: number;

  @ApiProperty({ enum: ["instagram", "telegram"] })
  integrationType: "instagram" | "telegram";

  @ApiProperty()
  integrationId: number;

  @ApiProperty()
  channelName: string;

  @ApiProperty()
  memberId: number;

  @ApiProperty()
  userId: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  createdAt: Date;
}

export class ChatAutoDistributionLogSummaryDto {
  @ApiProperty({ description: "Total distributions in the filtered range." })
  total: number;

  @ApiProperty({ type: [ChatAutoDistributionLogChannelSummaryDto] })
  byChannel: ChatAutoDistributionLogChannelSummaryDto[];

  @ApiProperty({ type: [ChatAutoDistributionLogMemberSummaryDto] })
  byMember: ChatAutoDistributionLogMemberSummaryDto[];

  @ApiProperty({
    type: [ChatAutoDistributionLogChannelMemberSummaryDto],
    description: "Breakdown by channel × member (for whom, per channel).",
  })
  byChannelAndMember: ChatAutoDistributionLogChannelMemberSummaryDto[];
}

export class ChatAutoDistributionLogResponseDto {
  @ApiProperty({ type: ChatAutoDistributionLogSummaryDto })
  summary: ChatAutoDistributionLogSummaryDto;

  @ApiProperty({ type: [ChatAutoDistributionLogItemDto] })
  items: ChatAutoDistributionLogItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}
