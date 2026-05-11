import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MediaResolverService } from '../../src/domain/media/media-resolver.service';
import { DedupService } from '../../src/domain/dedup/dedup.service';
import { NormalizerService, ChatwootWebhookPayload } from '../../src/domain/normalize/normalizer.service';
import { InboxConfig } from '../../src/database/entities/inbox-config.entity';
import { ContactsService } from '../../src/modules/contacts/contacts.service';
import { ConversationsService } from '../../src/modules/conversations/conversations.service';
import { NormalizeService } from '../../src/modules/normalize/normalize.service';

const basePayload: ChatwootWebhookPayload = {
  event: 'message_created',
  message_type: 'incoming',
  private: false,
  id: 100,
  content: 'Ola',
  content_type: 'text',
  created_at: 1746144000,
  conversation: { id: 45, inbox_id: 3 },
  contact: { id: 12, phone_number: '+5511999998888', name: 'Joao' },
  sender: { type: 'contact', phone_number: '+5511999998888' },
};

const inboxConfig = {
  id: 1,
  chatwootInboxId: 3,
  channelType: 'whatsapp',
  accountId: 1,
  active: true,
  bot: { code: 'n8n-bot', webhookUrl: 'https://n8n/webhook', webhookSecret: null },
} as InboxConfig;

describe('NormalizeService', () => {
  let svc: NormalizeService;
  let inboxConfigRepo: jest.Mocked<Repository<InboxConfig>>;
  let dedup: jest.Mocked<DedupService>;
  let mediaResolver: jest.Mocked<MediaResolverService>;
  let contacts: jest.Mocked<ContactsService>;
  let conversations: jest.Mocked<ConversationsService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NormalizeService,
        NormalizerService,
        { provide: getRepositoryToken(InboxConfig), useValue: { findOne: jest.fn() } },
        { provide: DedupService, useValue: { isDuplicate: jest.fn() } },
        { provide: MediaResolverService, useValue: { resolve: jest.fn() } },
        { provide: ContactsService, useValue: { upsertContact: jest.fn() } },
        { provide: ConversationsService, useValue: { upsertConversation: jest.fn() } },
      ],
    }).compile();

    svc = module.get(NormalizeService);
    inboxConfigRepo = module.get(getRepositoryToken(InboxConfig));
    dedup = module.get(DedupService);
    mediaResolver = module.get(MediaResolverService);
    contacts = module.get(ContactsService);
    conversations = module.get(ConversationsService);
  });

  it('retorna skip quando inbox nao encontrada', async () => {
    inboxConfigRepo.findOne.mockResolvedValue(null);
    const result = await svc.process(basePayload);
    expect(result).toEqual({ skip: true, reason: 'inbox_not_found' });
  });

  it('retorna skip quando normalizer filtra a mensagem', async () => {
    inboxConfigRepo.findOne.mockResolvedValue(inboxConfig);
    const result = await svc.process({ ...basePayload, message_type: 'outgoing' });
    expect(result.skip).toBe(true);
    expect((result as { skip: true; reason: string }).reason).toContain('message_type');
  });

  it('retorna skip quando mensagem duplicada', async () => {
    inboxConfigRepo.findOne.mockResolvedValue(inboxConfig);
    dedup.isDuplicate.mockResolvedValue(true);
    const result = await svc.process(basePayload);
    expect(result).toEqual({ skip: true, reason: 'duplicate' });
  });

  it('retorna InternalMessage em sucesso', async () => {
    inboxConfigRepo.findOne.mockResolvedValue(inboxConfig);
    dedup.isDuplicate.mockResolvedValue(false);
    contacts.upsertContact.mockResolvedValue({ id: 99 } as never);
    conversations.upsertConversation.mockResolvedValue({ id: 55 } as never);

    const result = await svc.process(basePayload);
    expect(result.skip).toBe(false);
    if (result.skip) return;
    expect(result.message.contentType).toBe('text');
    expect(result.message.phone).toBe('+5511999998888');
    expect(result.message.contactId).toBe(99);
    expect(result.message.botCode).toBe('n8n-bot');
  });

  it('resolve media antes de retornar', async () => {
    const mediaPayload: ChatwootWebhookPayload = {
      ...basePayload,
      content_type: 'text',
      attachments: [{ file_type: 'audio', data_url: 'https://chatwoot/audio.ogg', file_size: 5000 }],
    };
    inboxConfigRepo.findOne.mockResolvedValue(inboxConfig);
    dedup.isDuplicate.mockResolvedValue(false);
    contacts.upsertContact.mockResolvedValue({ id: 99 } as never);
    conversations.upsertConversation.mockResolvedValue({ id: 55 } as never);
    mediaResolver.resolve.mockResolvedValue({ url: 'https://minio/audio.ogg', mimeType: 'audio/ogg', viewOnce: false });

    const result = await svc.process(mediaPayload);
    expect(result.skip).toBe(false);
    if (result.skip) return;
    expect(result.message.media?.url).toBe('https://minio/audio.ogg');
    expect(mediaResolver.resolve).toHaveBeenCalled();
  });

  it('nao chama mediaResolver para view_once', async () => {
    const viewOncePayload: ChatwootWebhookPayload = {
      ...basePayload,
      content_type: 'view_once',
      attachments: [{ file_type: 'image', data_url: 'https://chatwoot/secret.jpg' }],
    };
    inboxConfigRepo.findOne.mockResolvedValue(inboxConfig);
    dedup.isDuplicate.mockResolvedValue(false);
    contacts.upsertContact.mockResolvedValue({ id: 99 } as never);
    conversations.upsertConversation.mockResolvedValue({ id: 55 } as never);

    const result = await svc.process(viewOncePayload);
    expect(result.skip).toBe(false);
    expect(mediaResolver.resolve).not.toHaveBeenCalled();
    if (result.skip) return;
    expect(result.message.media?.url).toBe('');
  });
});
