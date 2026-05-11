import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { ChatwootWebhookPayload } from '@domain/normalize/normalizer.service';

import { WebhookService } from './webhook.service';

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('chatwoot')
  @HttpCode(200)
  receiveChatwoot(@Body() payload: ChatwootWebhookPayload): { received: boolean } {
    this.webhookService.process(payload).catch(() => undefined);
    return { received: true };
  }
}
