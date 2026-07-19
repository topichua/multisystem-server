import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConversationEvent } from "../database/entities";
import { ConversationEventsService } from "./conversation-events.service";

@Module({
  imports: [TypeOrmModule.forFeature([ConversationEvent])],
  providers: [ConversationEventsService],
  exports: [ConversationEventsService],
})
export class ConversationEventsModule {}
