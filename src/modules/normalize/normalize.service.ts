import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DedupService } from '@domain/dedup/dedup.service';
import { MediaResolverService } from '@domain/media/media-resolver.service';
import { ChatwootWebhookPayload, NormalizerService } from '@domain/normalize/normalizer.service';
import { InternalMessage } from '@domain/types/internal-message.type';
import { InboxConfig } from '@database/entities/inbox-config.entity';
import { ContactsService } from '@modules/contacts/contacts.service';
import { ConversationsService } from '@modules/conversations/conversations.service';

export type NormalizeResult =
  | { skip: true; reason: string }
  | { skip: false; message: InternalMessage };

@Injectable()
export class NormalizeService {
  private readonly logger = new Logger(NormalizeService.name);
  private readonly inboxCache = new Map<number, { config: InboxConfig; expiresAt: number }>();
  private readonly cacheTtlMs = 5 * 60 * 1000;

  constructor(
    @InjectRepository(InboxConfig)
    private readonly inboxConfigRepo: Repository<InboxConfig>,
    private readonly normalizer: NormalizerService,
    private readonly dedup: DedupService,
    private readonly mediaResolver: MediaResolverService,
    private readonly contacts: ContactsService,
    private readonly conversations: ConversationsService,
  ) {}

  async process(payload: ChatwootWebhookPayload): Promise<NormalizeResult> {
    const chatwootInboxId = payload.conversation?.inbox_id;
    if (!chatwootInboxId) return { skip: true, reason: 'missing_inbox_id' };

    const inboxConfig = await this.loadInboxConfig(chatwootInboxId);
    if (!inboxConfig) {
      this.logger.warn(`InboxConfig not found inboxId=${chatwootInboxId}`);
      return { skip: true, reason: 'inbox_not_found' };
    }

    const normalized = this.normalizer.normalize(payload, inboxConfig);
    if (normalized.filtered) {
      this.logger.debug(`Filtered reason=${normalized.reason}`);
      return { skip: true, reason: normalized.reason };
    }

    const isDuplicate = await this.dedup.isDuplicate('chatwoot', normalized.message.messageId);
    if (isDuplicate) return { skip: true, reason: 'duplicate' };

    if (normalized.message.media && !normalized.message.media.viewOnce) {
      normalized.message.media = await this.mediaResolver.resolve(normalized.message.media);
    }

    const hasPhone = !!normalized.message.phone;

    const contact = hasPhone
      ? await this.contacts.upsertContact(
          inboxConfig.accountId,
          normalized.message.phone,
          payload.contact?.id,
        )
      : null;

    await this.conversations.upsertConversation(
      normalized.message.conversationId,
      normalized.message.inboxId,
      contact?.id ?? 0,
    );

    const baseUrl = inboxConfig.account?.baseUrl ?? '';
    const chatwootUrl = baseUrl
      ? `${baseUrl}/app/accounts/${inboxConfig.accountId}/conversations/${normalized.message.conversationId}`
      : '';

    return {
      skip: false,
      message: {
        ...normalized.message,
        contactId: contact?.id ?? payload.contact?.id,
        chatwootUrl,
      },
    };
  }

  private async loadInboxConfig(chatwootInboxId: number): Promise<InboxConfig | null> {
    const cached = this.inboxCache.get(chatwootInboxId);
    if (cached && cached.expiresAt > Date.now()) return cached.config;

    const config = await this.inboxConfigRepo.findOne({
      where: { chatwootInboxId, active: true },
      relations: ['account'],
    });

    if (config) {
      this.inboxCache.set(chatwootInboxId, { config, expiresAt: Date.now() + this.cacheTtlMs });
    } else {
      this.inboxCache.delete(chatwootInboxId);
    }

    return config;
  }
}
