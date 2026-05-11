import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';

import { InternalMessage } from '@domain/types/internal-message.type';

@Injectable()
export class N8nAdapter {
  private readonly logger = new Logger(N8nAdapter.name);

  async forwardInternalMessage(
    msg: InternalMessage,
    webhookUrl: string,
    webhookSecret: string | null,
  ): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (webhookSecret) {
      headers['X-Webhook-Secret'] = webhookSecret;
    }

    await axios.post(webhookUrl, msg, {
      headers,
      timeout: 10000,
      maxContentLength: 10 * 1024 * 1024,
      maxBodyLength: 10 * 1024 * 1024,
    });

    this.logger.log(`InternalMessage forwarded conversationId=${msg.conversationId} messageId=${msg.messageId}`);
  }
}
