import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Conversation,
  ConversationMessage,
  TelegramIntegration,
  TelegramUser,
} from "../database/entities";
import { ConversationsModule } from "../conversations/conversations.module";
import { ProductsModule } from "../products/products.module";
import { TelegramIntegrationsController } from "./telegram-integrations.controller";
import { TelegramIntegrationsService } from "./telegram-integrations.service";
import { TelegramConversationMessagingService } from "./telegram-conversation-messaging.service";
import { TelegramMessagePersistenceService } from "./telegram-message-persistence.service";
import { TelegramUpdatesListenerService } from "./telegram-updates-listener.service";
import { TelegramUserApiService } from "./telegram-user-api.service";
import { TelegramUsersService } from "./telegram-users.service";
import { TELEGRAM_CONVERSATION_MESSAGING } from "./telegram-integrations.tokens";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TelegramIntegration,
      TelegramUser,
      Conversation,
      ConversationMessage,
    ]),
    forwardRef(() => ConversationsModule),
    ProductsModule,
  ],
  controllers: [TelegramIntegrationsController],
  providers: [
    TelegramIntegrationsService,
    TelegramUserApiService,
    TelegramUsersService,
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
    TelegramUsersService,
  ],
})
export class TelegramIntegrationsModule {}
