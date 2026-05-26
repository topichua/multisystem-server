import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  InstagramIntegration,
  Conversation,
  ConversationMessage,
  TelegramIntegration,
  Workspace,
} from "../database/entities";
import { ConversationsModule } from "../conversations/conversations.module";
import { TelegramIntegrationsController } from "./telegram-integrations.controller";
import { TelegramIntegrationsService } from "./telegram-integrations.service";
import { TelegramConversationMessagingService } from "./telegram-conversation-messaging.service";
import { TelegramMessagePersistenceService } from "./telegram-message-persistence.service";
import { TelegramUpdatesListenerService } from "./telegram-updates-listener.service";
import { TelegramUserApiService } from "./telegram-user-api.service";
import { TELEGRAM_CONVERSATION_MESSAGING } from "./telegram-integrations.tokens";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TelegramIntegration,
      InstagramIntegration,
      Workspace,
      Conversation,
      ConversationMessage,
    ]),
    forwardRef(() => ConversationsModule),
  ],
  controllers: [TelegramIntegrationsController],
  providers: [
    TelegramIntegrationsService,
    TelegramUserApiService,
    TelegramMessagePersistenceService,
    TelegramConversationMessagingService,
    TelegramUpdatesListenerService,
    {
      provide: TELEGRAM_CONVERSATION_MESSAGING,
      useExisting: TelegramConversationMessagingService,
    },
  ],
  exports: [
    TelegramIntegrationsService,
    TelegramUpdatesListenerService,
    TELEGRAM_CONVERSATION_MESSAGING,
    TelegramMessagePersistenceService,
    TelegramUserApiService,
  ],
})
export class TelegramIntegrationsModule {}
