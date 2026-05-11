import { Injectable } from '@nestjs/common';

import { ChatwootAdapter } from '@adapters/chatwoot/chatwoot.adapter';

import { ConversationsService } from './conversations.service';

@Injectable()
export class ConversationActionsService {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly chatwoot: ChatwootAdapter,
  ) {}

  private async resolveIds(
    chatwootConversationId: number,
  ): Promise<{ accountId: number; inboxId: number }> {
    const conv = await this.conversations.repo.findOne({ where: { chatwootConversationId } });
    if (!conv) throw new Error(`Conversa ${chatwootConversationId} não encontrada.`);
    if (!conv.accountId) throw new Error(`accountId not set on conversation=${chatwootConversationId}`);
    return { accountId: conv.accountId, inboxId: conv.inboxId };
  }

  async setStatus(
    chatwootConversationId: number,
    status: 'open' | 'pending' | 'resolved' | 'snoozed',
  ): Promise<void> {
    const { accountId } = await this.resolveIds(chatwootConversationId);
    await this.chatwoot.setConversationStatus(chatwootConversationId, status, accountId);
    await this.conversations.setStatus(chatwootConversationId, status);
  }

  async addLabels(chatwootConversationId: number, labels: string[]): Promise<void> {
    const { accountId } = await this.resolveIds(chatwootConversationId);
    await this.chatwoot.addLabels(chatwootConversationId, accountId, labels);
  }

  async removeLabels(chatwootConversationId: number, labels: string[]): Promise<void> {
    const { accountId } = await this.resolveIds(chatwootConversationId);
    await this.chatwoot.removeLabels(chatwootConversationId, accountId, labels);
  }

  async getAgents(chatwootConversationId: number): Promise<unknown[]> {
    const { accountId, inboxId } = await this.resolveIds(chatwootConversationId);
    return this.chatwoot.getInboxAgents(accountId, inboxId);
  }

  async getAllAgents(chatwootConversationId: number): Promise<unknown[]> {
    const { accountId } = await this.resolveIds(chatwootConversationId);
    return this.chatwoot.getAllAgents(accountId);
  }

  async getTeams(chatwootConversationId: number): Promise<unknown[]> {
    const { accountId } = await this.resolveIds(chatwootConversationId);
    return this.chatwoot.getTeams(accountId);
  }
}
