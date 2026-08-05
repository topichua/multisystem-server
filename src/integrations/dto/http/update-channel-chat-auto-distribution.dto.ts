import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class UpdateChannelChatAutoDistributionRequestDto {
  @ApiProperty({
    description:
      "When true, new live chats on this Instagram/Telegram channel are " +
      "auto-assigned to members with work_status `accepting_new_chats` who can take the channel " +
      "(integration grant «Брати непризначені» / canTakeChat, conversations.full_access, or owner).",
    example: true,
  })
  @IsBoolean()
  chat_auto_distribution!: boolean;
}
