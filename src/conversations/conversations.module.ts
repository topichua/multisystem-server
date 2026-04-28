import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Company,
  Conversation,
  ConversationMessage,
  InstagramUser,
  Source,
} from '../database/entities';
import { ConversationsController } from './conversations.controller';
import { ConversationsAllocationService } from './conversations-allocation.service';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      Conversation,
      ConversationMessage,
      InstagramUser,
      Source,
    ]),
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationsAllocationService],
  exports: [ConversationsService, ConversationsAllocationService],
})
export class ConversationsModule {}
