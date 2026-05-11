import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ChatwootAdapter } from '@adapters/chatwoot/chatwoot.adapter';
import { InboxConfig } from '@database/entities/inbox-config.entity';
import { ConversationsService } from '@modules/conversations/conversations.service';

@Injectable()
export class MessagesService {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly chatwoot: ChatwootAdapter,
    @InjectRepository(InboxConfig)
    private readonly inboxConfigRepo: Repository<InboxConfig>,
  ) {}

  async sendMessage(
    chatwootConversationId: number,
    content: string,
    isPrivate: boolean,
  ): Promise<{ messageId: string; status: string }> {
    const conversation = await this.conversationsService.findByIdOrFail(chatwootConversationId);

    const inboxConfig = await this.inboxConfigRepo.findOne({
      where: { chatwootInboxId: conversation.inboxId },
    });

    if (!inboxConfig) {
      throw new Error(`InboxConfig not found for inboxId=${conversation.inboxId}`);
    }

    const result = await this.chatwoot.sendMessage(
      chatwootConversationId,
      content,
      isPrivate,
      inboxConfig.accountId,
    );

    return { messageId: result.messageId, status: 'sent' };
  }
}
