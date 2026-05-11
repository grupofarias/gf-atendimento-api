import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ChatwootAdapter } from '@adapters/chatwoot/chatwoot.adapter';
import { HandoffLog } from '@database/entities/handoff-log.entity';
import { ConversationsService } from '@modules/conversations/conversations.service';

@Injectable()
export class HandoffService {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly chatwoot: ChatwootAdapter,
    @InjectRepository(HandoffLog)
    private readonly handoffLogRepo: Repository<HandoffLog>,
  ) {}

  async handoff(
    chatwootConversationId: number,
    teamId: number | null,
    agentId: number | null,
    reason: string | null,
  ): Promise<{ status: string; botActive: boolean; conversationStatus: string }> {
    const conversation = await this.conversationsService.findByIdOrFail(chatwootConversationId);

    if (!conversation.accountId) {
      throw new Error(`accountId not set on conversation=${chatwootConversationId}`);
    }

    const accountId = conversation.accountId;

    if (teamId || agentId) {
      await this.chatwoot.assignTeam(chatwootConversationId, teamId, agentId, accountId);
    }
    await this.chatwoot.setConversationStatus(chatwootConversationId, 'open', accountId);
    await this.chatwoot.addLabels(chatwootConversationId, accountId, ['bot-off']);
    await this.conversationsService.setBotActive(chatwootConversationId, false);
    await this.conversationsService.setStatus(chatwootConversationId, 'open');

    const noteLines = ['🤖 Bot desativado pelo agente de IA.'];
    if (reason) noteLines.push(`Motivo: ${reason}`);
    if (agentId) noteLines.push(`Atendente ID: ${agentId}`);
    if (teamId) noteLines.push(`Time ID: ${teamId}`);
    await this.chatwoot.sendMessage(chatwootConversationId, noteLines.join('\n'), true, accountId);

    await this.handoffLogRepo.save(
      this.handoffLogRepo.create({
        conversationId: conversation.id,
        triggeredBy: 'n8n',
        teamId: teamId ?? null,
        agentId: agentId ?? null,
        reason: reason ?? null,
      }),
    );

    return { status: 'ok', botActive: false, conversationStatus: 'open' };
  }
}
