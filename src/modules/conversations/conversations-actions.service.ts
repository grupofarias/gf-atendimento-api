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

  private async resolveConfig(
    chatwootConversationId: number,
    fallbackInboxId?: number,
  ): Promise<{ accountId: number; inboxId: number }> {
    const conv = await this.conversations.repo.findOne({
      where: { chatwootConversationId },
    });
    const inboxId = conv?.inboxId ?? fallbackInboxId;
    if (!inboxId) throw new Error(`Conversa ${chatwootConversationId} não encontrada. Informe inboxId como query param.`);
    const config = await this.inboxConfigRepo.findOne({ where: { chatwootInboxId: inboxId } });
    if (!config) throw new Error(`InboxConfig not found for inboxId=${inboxId}`);
    return { accountId: config.accountId, inboxId };
  }

  private async resolveAccountId(chatwootConversationId: number, fallbackInboxId?: number): Promise<number> {
    return (await this.resolveConfig(chatwootConversationId, fallbackInboxId)).accountId;
  }

  async setStatus(
    chatwootConversationId: number,
    status: 'open' | 'pending' | 'resolved' | 'snoozed',
    inboxId?: number,
  ): Promise<void> {
    const accountId = await this.resolveAccountId(chatwootConversationId, inboxId);
    await this.chatwoot.setConversationStatus(chatwootConversationId, status, accountId);
    await this.conversations.setStatus(chatwootConversationId, status);
  }

  async addLabels(chatwootConversationId: number, labels: string[], inboxId?: number): Promise<void> {
    const accountId = await this.resolveAccountId(chatwootConversationId, inboxId);
    await this.chatwoot.addLabels(chatwootConversationId, accountId, labels);
  }

  async removeLabels(chatwootConversationId: number, labels: string[], inboxId?: number): Promise<void> {
    const accountId = await this.resolveAccountId(chatwootConversationId, inboxId);
    await this.chatwoot.removeLabels(chatwootConversationId, accountId, labels);
  }

  async getAgents(chatwootConversationId: number, inboxId?: number): Promise<unknown[]> {
    const config = await this.resolveConfig(chatwootConversationId, inboxId);
    return this.chatwoot.getInboxAgents(config.accountId, config.inboxId);
  }

  async getAllAgents(chatwootConversationId: number, inboxId?: number): Promise<unknown[]> {
    const accountId = await this.resolveAccountId(chatwootConversationId, inboxId);
    return this.chatwoot.getAllAgents(accountId);
  }

  async getTeams(chatwootConversationId: number, inboxId?: number): Promise<unknown[]> {
    const accountId = await this.resolveAccountId(chatwootConversationId, inboxId);
    return this.chatwoot.getTeams(accountId);
  }
}
