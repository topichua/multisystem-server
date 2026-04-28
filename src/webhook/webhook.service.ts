import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationsAllocationService } from '../conversations/conversations-allocation.service';
import type { InstagramWebhookPayload } from './instagram-webhook-payload.types';

@Injectable()
export class WebhookService {
  private readonly log = new Logger(WebhookService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly conversationsAllocationService: ConversationsAllocationService,
  ) {}

  /** Returns the challenge string when verification succeeds; otherwise `null`. */
  tryVerifyChallenge(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
  ): string | null {
    const expected =
      this.config.get<string>('WEBHOOK_VERIFY_TOKEN')?.trim() ?? '';
    if (!expected) {
      this.log.warn(
        'WEBHOOK_VERIFY_TOKEN is not set; webhook verification will fail',
      );
      return null;
    }
    if (mode === 'subscribe' && token === expected && challenge != null) {
      this.log.log('Webhook verified');
      return challenge;
    }
    return null;
  }

  async handleWebhookPost(
    instagram: InstagramWebhookPayload | null,
  ): Promise<void> {
    const traceId = randomUUID();
    if (instagram) {
      this.log.debug(
        `[webhook trace=${traceId}] payload:\n${JSON.stringify(instagram, null, 2)}`,
      );
      await this.conversationsAllocationService.allocateInstagramMessagingWebhook(
        instagram,
        traceId,
      );
      this.log.log(
        `[webhook trace=${traceId}] handler finished (allocation complete)`,
      );
    }
  }
}
