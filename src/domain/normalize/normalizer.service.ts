import { Injectable } from '@nestjs/common';

import { ChannelType, ContentType, InternalMessage, MediaInfo, MessageDirection } from '@domain/types/internal-message.type';

import { isGroupJid, normalizePhone } from './phone.util';

export interface ChatwootWebhookPayload {
  event: string;
  message_type?: string;
  private?: boolean;
  id?: number;
  content?: string;
  content_type?: string;
  created_at?: number | string;
  channel?: string;
  account?: {
    id?: number;
    name?: string;
  };
  inbox?: {
    id?: number;
    name?: string;
  };
  conversation?: {
    id: number;
    inbox_id: number;
    status?: string;
    assignee?: unknown;
    labels?: string[];
  };
  contact?: {
    id?: number;
    phone_number?: string;
    name?: string;
  };
  sender?: {
    type?: string;
    phone_number?: string;
    name?: string;
  };
  attachments?: Array<{
    file_type?: string;
    data_url?: string;
    thumb_url?: string;
    file_size?: number;
    width?: number;
    height?: number;
  }>;
  content_attributes?: {
    items?: unknown[];
    location?: { latitude: number; longitude: number; name?: string };
    [key: string]: unknown;
  };
}

export interface NormalizeResult {
  filtered: true;
  reason: string;
  message?: never;
}

export interface NormalizeSuccess {
  filtered: false;
  message: Omit<InternalMessage, 'contactId'> & { contactId?: number };
}

export type NormalizerResult = NormalizeResult | NormalizeSuccess;

@Injectable()
export class NormalizerService {
  normalize(
    payload: ChatwootWebhookPayload,
    inboxConfig: { chatwootInboxId: number; channelType: ChannelType },
  ): NormalizerResult {
    const rawPhone = payload.sender?.phone_number ?? payload.contact?.phone_number ?? '';

    if (isGroupJid(rawPhone)) {
      return { filtered: true, reason: 'group_message' };
    }

    const phone = normalizePhone(rawPhone);
    const contentType = this.resolveContentType(payload);
    const media = contentType !== 'text' && contentType !== 'location' && contentType !== 'contact_card'
      ? this.buildMediaInfo(payload, contentType)
      : undefined;

    const messageType = this.resolveMessageType(payload.message_type);

    return {
      filtered: false,
      message: {
        event: payload.event,
        messageId: String(payload.id ?? ''),
        conversationId: payload.conversation?.id ?? 0,
        contactId: payload.contact?.id,
        phone,
        inboxId: inboxConfig.chatwootInboxId,
        channelType: inboxConfig.channelType,
        contentType,
        messageType,
        isPrivate: payload.private === true,
        senderType: payload.sender?.type,
        labels: payload.conversation?.labels ?? [],
        accountId: payload.account?.id ?? 0,
        contactName: payload.sender?.name ?? payload.contact?.name,
        inboxName: payload.inbox?.name,
        chatwootUrl: '',
        text: contentType === 'text' || contentType === 'poll' ? (payload.content ?? undefined) : undefined,
        media,
        location: contentType === 'location'
          ? {
              latitude: payload.content_attributes?.location?.latitude ?? 0,
              longitude: payload.content_attributes?.location?.longitude ?? 0,
              label: payload.content_attributes?.location?.name,
            }
          : undefined,
        timestamp: this.resolveTimestamp(payload.created_at),
      },
    };
  }

  private resolveMessageType(messageType?: string): MessageDirection {
    if (messageType === 'outgoing') return 'outgoing';
    if (messageType === 'activity') return 'activity';
    return 'incoming';
  }

  private resolveTimestamp(created_at?: number | string): number {
    if (!created_at) return Date.now();
    if (typeof created_at === 'number') return created_at * 1000;
    const parsed = new Date(created_at).getTime();
    return Number.isNaN(parsed) ? Date.now() : parsed;
  }

  private resolveContentType(payload: ChatwootWebhookPayload): ContentType {
    const ct = payload.content_type ?? 'text';
    const attachment = payload.attachments?.[0];
    const fileType = attachment?.file_type;

    if (ct === 'view_once') return 'view_once';
    if (ct === 'poll') return 'poll';
    if (ct === 'location') return 'location';
    if (ct === 'contact_card') return 'contact_card';
    if (ct === 'input_select' || ct === 'input_csat' || ct === 'form') return 'unsupported';

    if (ct === 'text' && !attachment) return 'text';

    if (fileType === 'audio') return 'audio';
    if (fileType === 'image') return 'image';
    if (fileType === 'video') return 'video';
    if (fileType === 'sticker') return 'sticker';
    if (fileType === 'file') return 'file';

    if (ct === 'text' && attachment) return 'file';

    return 'unsupported';
  }

  private buildMediaInfo(payload: ChatwootWebhookPayload, contentType: ContentType): MediaInfo {
    const attachment = payload.attachments?.[0];
    const isViewOnce = contentType === 'view_once';

    return {
      url: isViewOnce ? '' : (attachment?.data_url ?? ''),
      mimeType: this.guessMimeType(contentType, attachment?.file_type),
      filename: undefined,
      size: attachment?.file_size,
      viewOnce: isViewOnce,
    };
  }

  private guessMimeType(contentType: ContentType, fileType?: string): string {
    if (fileType === 'audio') return 'audio/ogg';
    if (fileType === 'image') return 'image/jpeg';
    if (fileType === 'video') return 'video/mp4';
    if (fileType === 'sticker') return 'image/webp';
    if (contentType === 'view_once') return 'image/jpeg';
    return 'application/octet-stream';
  }
}
