import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ChatwootAdapter } from '@adapters/chatwoot/chatwoot.adapter';
import { InboxConfig } from '@database/entities/inbox-config.entity';

import { ConversationsService } from './conversations.service';

@Injectable()
export class ConversationActionsService {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly chatwoot: ChatwootAdapter,
    @InjectRepository(InboxConfig)
    private readonly inboxConfigRepo: Repository<InboxConfig>,
  ) {}

  private async resolveAccountId(chatwootConversationId: number): Promise<number> {
    const conv = await this.conversations.findByIdOrFail(chatwootConversationId);
    const config = await this.inboxConfigRepo.findOne({ where: { chatwootInboxId: conv.inboxId } });
    if (!config) throw new Error(`InboxConfig not found for inboxId=${conv.inboxId}`);
    return config.accountId;
  }

  async setStatus(
    chatwootConversationId: number,
    status: 'open' | 'pending' | 'resolved' | 'snoozed',
  ): Promise<void> {
    const accountId = await this.resolveAccountId(chatwootConversationId);
    await this.chatwoot.setConversationStatus(chatwootConversationId, status, accountId);
    await this.conversations.setStatus(chatwootConversationId, status);
  }

  async addLabels(chatwootConversationId: number, labels: string[]): Promise<void> {
    const accountId = await this.resolveAccountId(chatwootConversationId);
    await this.chatwoot.addLabels(chatwootConversationId, accountId, labels);
  }

  async removeLabels(chatwootConversationId: number, labels: string[]): Promise<void> {
    const accountId = await this.resolveAccountId(chatwootConversationId);
    await this.chatwoot.removeLabels(chatwootConversationId, accountId, labels);
  }

  async getAgents(chatwootConversationId: number, search?: string): Promise<unknown[]> {
    const accountId = await this.resolveAccountId(chatwootConversationId);
    return this.chatwoot.getAgents(accountId, search);
  }

  async getTeams(chatwootConversationId: number): Promise<unknown[]> {
    const accountId = await this.resolveAccountId(chatwootConversationId);
    return this.chatwoot.getTeams(accountId);
  }
}
