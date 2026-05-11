import { Injectable } from '@nestjs/common';

import { ChatwootAdapter } from '@adapters/chatwoot/chatwoot.adapter';
import { ConversationsService } from '@modules/conversations/conversations.service';

@Injectable()
export class MessagesService {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly chatwoot: ChatwootAdapter,
  ) {}

  async sendMessage(
    chatwootConversationId: number,
    content: string,
    isPrivate: boolean,
  ): Promise<{ messageId: string; status: string }> {
    const conversation = await this.conversationsService.findByIdOrFail(chatwootConversationId);

    if (!conversation.accountId) {
      throw new Error(`accountId not set on conversation=${chatwootConversationId}`);
    }

    const result = await this.chatwoot.sendMessage(
      chatwootConversationId,
      content,
      isPrivate,
      conversation.accountId,
    );

    return { messageId: result.messageId, status: 'sent' };
  }
}
