import type { Conversation } from "../database/entities";
import type { OutboundConversationMessageMediaType } from "../conversations/dto/http/send-instagram-message-request.dto";
import type { SendInstagramMessageResponseDto } from "../conversations/dto/http/send-instagram-message-response.dto";

export const TELEGRAM_CONVERSATION_MESSAGING = Symbol(
  "TELEGRAM_CONVERSATION_MESSAGING",
);

export type TelegramConversationMessagingPort = {
  sendMessageForConversation(
    ownerId: number,
    conv: Conversation,
    message: string,
    replyToExternalId?: string,
    file?: { buffer: Buffer; mimetype?: string; originalname?: string },
    mediaType?: OutboundConversationMessageMediaType,
  ): Promise<SendInstagramMessageResponseDto>;
};
