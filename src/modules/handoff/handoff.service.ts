import { BadRequestException, Injectable } from '@nestjs/common';
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
    if (!teamId && !agentId) {
      throw new BadRequestException({
        error: 'Ao menos teamId ou agentId deve ser informado',
        code: 'MISSING_HANDOFF_TARGET',
      });
    }

    const conversation = await this.conversationsService.findByIdOrFail(chatwootConversationId);

    const inboxConfig = await this.inboxConfigRepo.findOne({
      where: { chatwootInboxId: conversation.inboxId },
    });

    if (!inboxConfig) throw new Error(`InboxConfig not found for inboxId=${conversation.inboxId}`);

    await this.chatwoot.assignTeam(chatwootConversationId, teamId, agentId, inboxConfig.accountId);
    await this.chatwoot.setConversationStatus(chatwootConversationId, 'pending', inboxConfig.accountId);
    await this.conversationsService.setBotActive(chatwootConversationId, false);
    await this.conversationsService.setStatus(chatwootConversationId, 'pending');

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
