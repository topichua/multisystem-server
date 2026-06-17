import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WebhookEvent } from "../database/entities";
import { ConversationsModule } from "../conversations/conversations.module";
import { WebhookController } from "./webhook.controller";
import { WebhookEventsWorkerService } from "./webhook-events-worker.service";
import { WebhookEventsService } from "./webhook-events.service";
import { WebhookService } from "./webhook.service";

@Module({
  imports: [
    ConfigModule,
    ConversationsModule,
    TypeOrmModule.forFeature([WebhookEvent]),
  ],
  controllers: [WebhookController],
  providers: [WebhookService, WebhookEventsService, WebhookEventsWorkerService],
  exports: [WebhookEventsService],
})
export class WebhookModule {}
