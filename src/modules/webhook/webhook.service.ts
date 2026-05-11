import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { InboxConfig } from '@database/entities/inbox-config.entity';
import { DedupService } from '@domain/dedup/dedup.service';
import { MediaResolverService } from '@domain/media/media-resolver.service';
import { ChatwootWebhookPayload, NormalizerService } from '@domain/normalize/normalizer.service';
import { OutboxWorkerService } from '@domain/outbox/outbox-worker.service';
import { ConversationsService } from '@modules/conversations/conversations.service';
import { ContactsService } from '@modules/contacts/contacts.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly inboxCache = new Map<number, { config: InboxConfig; expiresAt: number }>();
  private readonly cacheTtlMs = 5 * 60 * 1000;

  constructor(
    @InjectRepository(InboxConfig)
    private readonly inboxConfigRepo: Repository<InboxConfig>,
    private readonly normalizer: NormalizerService,
    private readonly dedup: DedupService,
    private readonly mediaResolver: MediaResolverService,
    private readonly outboxWorker: OutboxWorkerService,
    private readonly contacts: ContactsService,
    private readonly conversations: ConversationsService,
  ) {}

  private async loadInboxConfig(chatwootInboxId: number): Promise<InboxConfig | null> {
    const cached = this.inboxCache.get(chatwootInboxId);
    if (cached && cached.expiresAt > Date.now()) return cached.config;

    const config = await this.inboxConfigRepo.findOne({
      where: { chatwootInboxId, active: true },
      relations: ['bot'],
    });

    if (config) {
      this.inboxCache.set(chatwootInboxId, { config, expiresAt: Date.now() + this.cacheTtlMs });
    } else {
      this.inboxCache.delete(chatwootInboxId);
    }

    return config;
  }

  async process(payload: ChatwootWebhookPayload): Promise<void> {
    const chatwootInboxId = payload.conversation?.inbox_id;
    if (!chatwootInboxId) return;

    const inboxConfig = await this.loadInboxConfig(chatwootInboxId);

    if (!inboxConfig) {
      this.logger.warn(`InboxConfig not found for inboxId=${chatwootInboxId}`);
      return;
    }

    if (payload.event === 'conversation_updated') {
      await this.handleConversationUpdated(payload);
      return;
    }

    if (payload.event === 'conversation_status_changed') {
      await this.handleConversationStatusChanged(payload);
      return;
    }

    const result = this.normalizer.normalize(payload, inboxConfig);
    if (result.filtered) {
      this.logger.debug(`Filtered webhook reason=${result.reason}`);
      return;
    }

    const messageId = result.message.messageId;
    const isDuplicate = await this.dedup.isDuplicate('chatwoot', messageId);
    if (isDuplicate) return;

    if (result.message.media && !result.message.media.viewOnce) {
      result.message.media = await this.mediaResolver.resolve(result.message.media);
    }

    const contact = await this.contacts.upsertContact(
      inboxConfig.accountId,
      result.message.phone,
      payload.contact?.id,
    );

    const conversation = await this.conversations.upsertConversation(
      result.message.conversationId,
      result.message.inboxId,
      contact.id,
    );

    const internalMessage = {
      ...result.message,
      contactId: contact.id,
      botCode: inboxConfig.bot.code,
    };

    await this.outboxWorker.enqueue(
      conversation.id,
      internalMessage,
      inboxConfig.bot.webhookUrl,
      inboxConfig.bot.webhookSecret,
    );
  }

  private async handleConversationUpdated(payload: ChatwootWebhookPayload): Promise<void> {
    const chatwootConversationId = payload.conversation?.id;
    if (!chatwootConversationId) return;

    if (payload.conversation?.assignee) {
      await this.conversations.setBotActive(chatwootConversationId, false);
      this.logger.log(`botActive=false via chatwoot_assignee conversationId=${chatwootConversationId}`);
    }
  }

  private async handleConversationStatusChanged(payload: ChatwootWebhookPayload): Promise<void> {
    const chatwootConversationId = payload.conversation?.id;
    const status = payload.conversation?.status;
    if (!chatwootConversationId || !status) return;

    if (status === 'open') {
      await this.conversations.setBotActive(chatwootConversationId, true);
      await this.conversations.setStatus(chatwootConversationId, 'open');
      this.logger.log(`botActive=true conversationId=${chatwootConversationId} status=open`);
    } else {
      await this.conversations.setStatus(chatwootConversationId, status as 'pending' | 'resolved' | 'snoozed');
    }
  }
}
