import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ChatwootAdapter } from '@adapters/chatwoot/chatwoot.adapter';
import { HandoffLog } from '@database/entities/handoff-log.entity';
import { InboxConfig } from '@database/entities/inbox-config.entity';
import { ConversationsService } from '@modules/conversations/conversations.service';

@Injectable()
export class HandoffService {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly chatwoot: ChatwootAdapter,
    @InjectRepository(HandoffLog)
    private readonly handoffLogRepo: Repository<HandoffLog>,
    @InjectRepository(InboxConfig)
    private readonly inboxConfigRepo: Repository<InboxConfig>,
  ) {}

  async handoff(
    chatwootConversationId: number,
    teamId: number | null,
    agentId: number | null,
    reason: string | null,
  ): Promise<{ status: string; botActive: boolean; conversationStatus: string }> {
    const conversation = await this.conversationsService.findByIdOrFail(chatwootConversationId);

    const inboxConfig = await this.inboxConfigRepo.findOne({
      where: { chatwootInboxId: conversation.inboxId },
    });

    if (!inboxConfig) throw new Error(`InboxConfig not found for inboxId=${conversation.inboxId}`);

    if (teamId || agentId) {
      await this.chatwoot.assignTeam(chatwootConversationId, teamId, agentId, inboxConfig.accountId);
    }
    await this.chatwoot.setConversationStatus(chatwootConversationId, 'pending', inboxConfig.accountId);
    await this.chatwoot.addLabels(chatwootConversationId, inboxConfig.accountId, ['bot-off']);
    await this.conversationsService.setBotActive(chatwootConversationId, false);
    await this.conversationsService.setStatus(chatwootConversationId, 'pending');

    const noteLines = ['🤖 Bot desativado pelo agente de IA.'];
    if (reason) noteLines.push(`Motivo: ${reason}`);
    if (agentId) noteLines.push(`Atendente ID: ${agentId}`);
    if (teamId) noteLines.push(`Time ID: ${teamId}`);
    await this.chatwoot.sendMessage(chatwootConversationId, noteLines.join('\n'), true, inboxConfig.accountId);

    await this.handoffLogRepo.save(
      this.handoffLogRepo.create({
        conversationId: conversation.id,
        triggeredBy: 'n8n',
        teamId: teamId ?? null,
        agentId: agentId ?? null,
        reason: reason ?? null,
      }),
    );

    return { status: 'ok', botActive: false, conversationStatus: 'pending' };
  }
}
