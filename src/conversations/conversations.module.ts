import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  InstagramIntegration,
  Conversation,
  ConversationGroup,
  ConversationEvent,
  ConversationMessage,
  InstagramUser,
  TelegramUser,
  TelegramIntegration,
  WorkspaceMember,
  ProductSuggestion,
  Product,
  ProductVariant,
  Client,
  ClientLink,
} from "../database/entities";
import { AuthModule } from "../auth/auth.module";
import { InstagramModule } from "../instagram/instagram.module";
import { ProductsModule } from "../products/products.module";
import { StorageModule } from "../storage/storage.module";
import { TelegramIntegrationsModule } from "../telegram-integrations/telegram-integrations.module";
import { ConversationGroupDefaultsModule } from "./conversation-group-defaults.module";
import { ConversationGroupsController } from "./conversation-groups.controller";
import { ConversationGroupsService } from "./conversation-groups.service";
import { ConversationEventsService } from "./conversation-events.service";
import { ConversationWorkflowService } from "./conversation-workflow.service";
import { ConversationMessageNotifyService } from "./conversation-message-notify.service";
import { ConversationMessagePresenterService } from "./conversation-message-presenter.service";
import { ConversationMediaArchiveService } from "./conversation-media-archive.service";
import { ConversationsController } from "./conversations.controller";
import { ConversationsAllocationService } from "./conversations-allocation.service";
import { ConversationsGateway } from "./conversations.gateway";
import { ConversationsRealtimeService } from "./conversations-realtime.service";
import { ConversationsService } from "./conversations.service";

@Module({
  imports: [
    AuthModule,
    InstagramModule,
    ProductsModule,
    StorageModule,
    ConversationGroupDefaultsModule,
    forwardRef(() => TelegramIntegrationsModule),
    TypeOrmModule.forFeature([
      InstagramIntegration,
      Conversation,
      ConversationGroup,
      ConversationEvent,
      ConversationMessage,
      InstagramUser,
      TelegramUser,
      TelegramIntegration,
      WorkspaceMember,
      ProductSuggestion,
      Product,
      ProductVariant,
      Client,
      ClientLink,
    ]),
  ],
  controllers: [ConversationsController, ConversationGroupsController],
  providers: [
    ConversationsService,
    ConversationsAllocationService,
    ConversationGroupsService,
    ConversationEventsService,
    ConversationWorkflowService,
    ConversationMessagePresenterService,
    ConversationMediaArchiveService,
    ConversationMessageNotifyService,
    ConversationsRealtimeService,
    ConversationsGateway,
  ],
  exports: [
    ConversationsService,
    ConversationsAllocationService,
    ConversationGroupsService,
    ConversationEventsService,
    ConversationMessageNotifyService,
    ConversationMediaArchiveService,
    ConversationWorkflowService,
  ],
})
export class ConversationsModule {}
