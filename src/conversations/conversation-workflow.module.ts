import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Conversation, ConversationGroup } from "../database/entities";
import { ConversationEventsModule } from "./conversation-events.module";
import { ConversationGroupDefaultsModule } from "./conversation-group-defaults.module";
import { ConversationWorkflowService } from "./conversation-workflow.service";

/**
 * Lightweight module for conversation group workflow (system + automation).
 * Avoid importing full ConversationsModule (Auth/products/telegram) from automations.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ConversationGroup]),
    ConversationGroupDefaultsModule,
    ConversationEventsModule,
  ],
  providers: [ConversationWorkflowService],
  exports: [ConversationWorkflowService],
})
export class ConversationWorkflowModule {}
