import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { isInstagramWebhookPayload } from './instagram-webhook-payload.types';
import { WebhookService } from './webhook.service';

/**
 * Meta / Instagram webhooks (callback URL verification + events).
 * Path matches the common Express example: `GET/POST /webhook`.
 */
@ApiTags('webhook')
@Controller('webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({
    summary: 'Meta webhook verification (hub.challenge)',
    description:
      'Echoes `hub.challenge` when `hub.mode=subscribe` and `hub.verify_token` matches WEBHOOK_VERIFY_TOKEN.',
  })
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
  ): string {
    const out = this.webhookService.tryVerifyChallenge(mode, token, challenge);
    if (out == null) {
      throw new ForbiddenException();
    }
    return out;
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Meta webhook events',
    description: 'Logs the JSON payload and responds with 200 OK.',
  })
  async handleEvent(@Body() body: unknown): Promise<void> {
    const instagram = isInstagramWebhookPayload(body) ? body : null;
    await this.webhookService.handleWebhookPost(instagram, body);
  }
}
