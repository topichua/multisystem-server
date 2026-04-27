import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConversationsModule } from '../conversations/conversations.module';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [ConfigModule, ConversationsModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
