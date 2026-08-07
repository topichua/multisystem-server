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
import { ChatAutoDistributionLog } from "../database/entities/chat-auto-distribution-log.entity";
import { AuthModule } from "../auth/auth.module";
import { InstagramModule } from "../instagram/instagram.module";
import { ProductsModule } from "../products/products.module";
import { StorageModule } from "../storage/storage.module";
import { TelegramIntegrationsModule } from "../telegram-integrations/telegram-integrations.module";
import { ConversationGroupDefaultsModule } from "./conversation-group-defaults.module";
import { ConversationEventsModule } from "./conversation-events.module";
import { ConversationGroupsController } from "./conversation-groups.controller";
import { ConversationGroupsService } from "./conversation-groups.service";
import { ConversationWorkflowService } from "./conversation-workflow.service";
import { ChatAutoDistributionService } from "./chat-auto-distribution.service";
import { ConversationMessageNotifyService } from "./conversation-message-notify.service";
import { ConversationMessagePresenterService } from "./conversation-message-presenter.service";
import { ConversationMediaArchiveService } from "./conversation-media-archive.service";
import { ConversationsController } from "./conversations.controller";
import { ConversationsAllocationService } from "./conversations-allocation.service";
import { ConversationIdAllocationService } from "./conversation-id-allocation.service";
import { ConversationsGateway } from "./conversations.gateway";
import { ConversationsRealtimeService } from "./conversations-realtime.service";
import { ConversationsService } from "./conversations.service";
import { InstagramSynchronizationWorkerService } from "./instagram-synchronization-worker.service";

@Module({
  imports: [
    AuthModule,
    InstagramModule,
    ProductsModule,
    StorageModule,
    ConversationGroupDefaultsModule,
    ConversationEventsModule,
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
      ChatAutoDistributionLog,
    ]),
  ],
  controllers: [ConversationsController, ConversationGroupsController],
  providers: [
    ConversationsService,
    ConversationsAllocationService,
    ConversationIdAllocationService,
    ConversationGroupsService,
    ConversationWorkflowService,
    ChatAutoDistributionService,
    ConversationMessagePresenterService,
    ConversationMediaArchiveService,
    ConversationMessageNotifyService,
    ConversationsRealtimeService,
    ConversationsGateway,
    InstagramSynchronizationWorkerService,
  ],
  exports: [
    ConversationsService,
    ConversationsAllocationService,
    ConversationIdAllocationService,
    ConversationGroupsService,
    ConversationEventsModule,
    ConversationMessageNotifyService,
    ConversationMediaArchiveService,
    ConversationWorkflowService,
    ChatAutoDistributionService,
  ],
})
export class ConversationsModule {}
