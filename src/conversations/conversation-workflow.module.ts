import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Conversation, ConversationGroup } from "../database/entities";
import { ConversationEventsModule } from "./conversation-events.module";
import { ConversationFollowUpsModule } from "./conversation-follow-ups.module";
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
    forwardRef(() => ConversationFollowUpsModule),
  ],
  providers: [ConversationWorkflowService],
  exports: [ConversationWorkflowService],
})
export class ConversationWorkflowModule {}
