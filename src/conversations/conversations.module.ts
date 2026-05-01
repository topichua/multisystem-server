import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Company,
  Conversation,
  ConversationGroup,
  ConversationMessage,
  InstagramUser,
} from '../database/entities';
import { ConversationGroupsController } from './conversation-groups.controller';
import { ConversationGroupsService } from './conversation-groups.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsAllocationService } from './conversations-allocation.service';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [
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
  ],
  exports: [
    ConversationsService,
    ConversationsAllocationService,
    ConversationGroupsService,
  ],
})
export class ConversationsModule {}
