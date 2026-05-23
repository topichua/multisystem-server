import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Company,
  Conversation,
  ConversationGroup,
  ConversationMessage,
  InstagramUser,
} from "../database/entities";
import { AuthModule } from "../auth/auth.module";
import { ConversationGroupsController } from "./conversation-groups.controller";
import { ConversationGroupsService } from "./conversation-groups.service";
import { ConversationMessageNotifyService } from "./conversation-message-notify.service";
import { ConversationMessagePresenterService } from "./conversation-message-presenter.service";
import { ConversationsController } from "./conversations.controller";
import { ConversationsAllocationService } from "./conversations-allocation.service";
import { ConversationsGateway } from "./conversations.gateway";
import { ConversationsRealtimeService } from "./conversations-realtime.service";
import { ConversationsService } from "./conversations.service";

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      Company,
      Conversation,
      ConversationGroup,
      ConversationMessage,
      InstagramUser,
    ]),
  ],
  controllers: [ConversationsController, ConversationGroupsController],
  providers: [
    ConversationsService,
    ConversationsAllocationService,
    ConversationGroupsService,
    ConversationMessagePresenterService,
    ConversationMessageNotifyService,
    ConversationsRealtimeService,
    ConversationsGateway,
  ],
  exports: [
    ConversationsService,
    ConversationsAllocationService,
    ConversationGroupsService,
  ],
})
export class ConversationsModule {}
