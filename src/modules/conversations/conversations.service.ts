import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Conversation, ConversationStatus } from '@database/entities/conversation.entity';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    @InjectRepository(Conversation)
    readonly repo: Repository<Conversation>,
  ) {}

  async upsertConversation(
    chatwootConversationId: number,
    inboxId: number,
    contactId: number,
  ): Promise<Conversation> {
    const existing = await this.repo.findOne({ where: { chatwootConversationId } });
    if (existing) return existing;

    const conversation = this.repo.create({ chatwootConversationId, inboxId, contactId });
    try {
      return await this.repo.save(conversation);
    } catch {
      const found = await this.repo.findOne({ where: { chatwootConversationId } });
      if (found) return found;
      throw new Error(`upsertConversation: could not create or find conversation=${chatwootConversationId}`);
    }
  }

  async findByIdOrFail(conversationId: number): Promise<Conversation> {
    const conv = await this.repo.findOne({ where: { chatwootConversationId: conversationId } });
    if (!conv) throw new NotFoundException(`Conversa ${conversationId} nao encontrada no middleware`);
    return conv;
  }

  async findLocalById(localId: number): Promise<Conversation | null> {
    return this.repo.findOne({ where: { id: localId } });
  }

  async setBotActive(chatwootConversationId: number, active: boolean): Promise<void> {
    await this.repo.update({ chatwootConversationId }, { botActive: active });
    this.logger.log(`botActive=${active} conversationId=${chatwootConversationId}`);
  }

  async setStatus(chatwootConversationId: number, status: ConversationStatus): Promise<void> {
    await this.repo.update({ chatwootConversationId }, { status });
  }
}
