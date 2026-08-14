import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Conversation,
  ConversationFollowUp,
  Workspace,
} from "../database/entities";
import { WorkspaceAccessModule } from "../workspace-access/workspace-access.module";
import { ConversationEventsModule } from "./conversation-events.module";
import { ConversationFollowUpsService } from "./conversation-follow-ups.service";
import { ConversationFollowUpsWorkerService } from "./conversation-follow-ups.worker.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationFollowUp, Conversation, Workspace]),
    ConversationEventsModule,
    WorkspaceAccessModule,
  ],
  providers: [ConversationFollowUpsService, ConversationFollowUpsWorkerService],
  exports: [ConversationFollowUpsService],
})
export class ConversationFollowUpsModule {}
