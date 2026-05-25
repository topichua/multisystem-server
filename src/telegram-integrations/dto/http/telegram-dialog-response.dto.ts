import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class TelegramDialogResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ description: "True for private 1:1 chats" })
  isUser: boolean;

  @ApiProperty()
  isGroup: boolean;

  @ApiPropertyOptional()
  unreadCount?: number;
}

export class TelegramDialogsListResponseDto {
  @ApiProperty({ type: [TelegramDialogResponseDto] })
  items: TelegramDialogResponseDto[];
}
