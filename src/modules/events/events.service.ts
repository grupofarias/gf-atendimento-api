import { Injectable, Logger } from '@nestjs/common';

import { ConversationStatus } from '@database/entities/conversation.entity';
import { ConversationsService } from '@modules/conversations/conversations.service';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly conversations: ConversationsService) {}

  async handleConversationUpdated(conversationId: number, hasAssignee: boolean): Promise<void> {
    if (hasAssignee) {
      await this.conversations.setBotActive(conversationId, false);
      this.logger.log(`botActive=false via assignee conversationId=${conversationId}`);
    }
  }

  async handleConversationStatusChanged(
    conversationId: number,
    status: ConversationStatus,
  ): Promise<void> {
    if (status === 'open') {
      await this.conversations.setBotActive(conversationId, true);
    }
    await this.conversations.setStatus(conversationId, status);
    this.logger.log(`status=${status} conversationId=${conversationId}`);
  }
}
