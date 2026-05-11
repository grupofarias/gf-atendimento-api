import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DedupService } from '@domain/dedup/dedup.service';
import { MediaResolverService } from '@domain/media/media-resolver.service';
import { ChatwootWebhookPayload, NormalizerService } from '@domain/normalize/normalizer.service';
import { ChannelType } from '@domain/types/internal-message.type';
import { InternalMessage } from '@domain/types/internal-message.type';
import { ChatwootAccount } from '@database/entities/chatwoot-account.entity';
import { ContactsService } from '@modules/contacts/contacts.service';
import { ConversationsService } from '@modules/conversations/conversations.service';

export type NormalizeResult =
  | { skip: true; reason: string }
  | { skip: false; botActive: boolean; message: InternalMessage };

const CHANNEL_MAP: Record<string, ChannelType> = {
  'Channel::Whatsapp': 'whatsapp',
  'Channel::WebWidget': 'webchat',
  'Channel::Instagram': 'instagram',
  'Channel::FacebookPage': 'facebook',
  'Channel::Api': 'api',
};

@Injectable()
export class NormalizeService {
  private readonly logger = new Logger(NormalizeService.name);
  private readonly accountCache = new Map<number, { account: ChatwootAccount; expiresAt: number }>();
  private readonly cacheTtlMs = 5 * 60 * 1000;

  constructor(
    @InjectRepository(ChatwootAccount)
    private readonly accountRepo: Repository<ChatwootAccount>,
    private readonly normalizer: NormalizerService,
    private readonly dedup: DedupService,
    private readonly mediaResolver: MediaResolverService,
    private readonly contacts: ContactsService,
    private readonly conversations: ConversationsService,
  ) {}

  async process(payload: ChatwootWebhookPayload): Promise<NormalizeResult> {
    const chatwootInboxId = payload.conversation?.inbox_id;
    if (!chatwootInboxId) return { skip: true, reason: 'missing_inbox_id' };

    const accountId = payload.account?.id;
    if (!accountId) return { skip: true, reason: 'missing_account_id' };

    const account = await this.loadAccount(accountId);
    if (!account) {
      this.logger.warn(`ChatwootAccount not found accountId=${accountId}`);
      return { skip: true, reason: 'account_not_found' };
    }

    const channelType: ChannelType = CHANNEL_MAP[payload.channel ?? ''] ?? 'api';

    const normalized = this.normalizer.normalize(payload, { chatwootInboxId, channelType });
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
          accountId,
          normalized.message.phone,
          payload.contact?.id,
        )
      : null;

    const conversation = await this.conversations.upsertConversation(
      normalized.message.conversationId,
      normalized.message.inboxId,
      contact?.id ?? null,
      accountId,
    );

    const chatwootUrl = account.baseUrl
      ? `${account.baseUrl}/app/accounts/${accountId}/conversations/${normalized.message.conversationId}`
      : '';

    return {
      skip: false,
      botActive: conversation.botActive,
      message: {
        ...normalized.message,
        contactId: contact?.id ?? payload.contact?.id,
        chatwootUrl,
      },
    };
  }

  private async loadAccount(accountId: number): Promise<ChatwootAccount | null> {
    const cached = this.accountCache.get(accountId);
    if (cached && cached.expiresAt > Date.now()) return cached.account;

    const account = await this.accountRepo.findOne({ where: { accountId } });

    if (account) {
      this.accountCache.set(accountId, { account, expiresAt: Date.now() + this.cacheTtlMs });
    } else {
      this.accountCache.delete(accountId);
    }

    return account;
  }
}
