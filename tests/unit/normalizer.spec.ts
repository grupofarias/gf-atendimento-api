import { NormalizerService, ChatwootWebhookPayload } from '../../src/domain/normalize/normalizer.service';

const inboxConfig = { chatwootInboxId: 3, channelType: 'whatsapp' as const };

function basePayload(overrides: Partial<ChatwootWebhookPayload> = {}): ChatwootWebhookPayload {
  return {
    event: 'message_created',
    message_type: 'incoming',
    private: false,
    id: 1,
    content: 'Ola',
    content_type: 'text',
    created_at: 1746144000,
    conversation: { id: 45, inbox_id: 3 },
    contact: { id: 12, phone_number: '+5511999998888', name: 'Joao' },
    sender: { type: 'contact', phone_number: '+5511999998888' },
    ...overrides,
  };
}

describe('NormalizerService', () => {
  let svc: NormalizerService;

  beforeEach(() => {
    svc = new NormalizerService();
  });

  it('normaliza mensagem de texto incoming', () => {
    const result = svc.normalize(basePayload(), inboxConfig);
    expect(result.filtered).toBe(false);
    if (result.filtered) return;
    expect(result.message.contentType).toBe('text');
    expect(result.message.text).toBe('Ola');
    expect(result.message.phone).toBe('+5511999998888');
    expect(result.message.conversationId).toBe(45);
    expect(result.message.messageType).toBe('incoming');
    expect(result.message.isPrivate).toBe(false);
    expect(result.message.event).toBe('message_created');
  });

  it('normaliza mensagem outgoing sem filtrar', () => {
    const result = svc.normalize(basePayload({ message_type: 'outgoing' }), inboxConfig);
    expect(result.filtered).toBe(false);
    if (result.filtered) return;
    expect(result.message.messageType).toBe('outgoing');
  });

  it('normaliza mensagem privada sem filtrar', () => {
    const result = svc.normalize(basePayload({ private: true }), inboxConfig);
    expect(result.filtered).toBe(false);
    if (result.filtered) return;
    expect(result.message.isPrivate).toBe(true);
  });

  it('normaliza sender type=agent sem filtrar', () => {
    const result = svc.normalize(
      basePayload({ sender: { type: 'agent', phone_number: '+5511999998888' } }),
      inboxConfig,
    );
    expect(result.filtered).toBe(false);
    if (result.filtered) return;
    expect(result.message.senderType).toBe('agent');
  });

  it('nao filtra quando sender.type ausente (canal API)', () => {
    const result = svc.normalize(
      basePayload({ sender: { phone_number: '+5511999998888' } }),
      inboxConfig,
    );
    expect(result.filtered).toBe(false);
  });

  it('filtra mensagem de grupo (@g.us)', () => {
    const result = svc.normalize(
      basePayload({ sender: { type: 'contact', phone_number: '120363000@g.us' } }),
      inboxConfig,
    );
    expect(result.filtered).toBe(true);
    expect((result as { filtered: true; reason: string }).reason).toBe('group_message');
  });

  it('normaliza qualquer evento sem filtrar', () => {
    const result = svc.normalize(
      basePayload({ event: 'conversation_updated' }),
      inboxConfig,
    );
    expect(result.filtered).toBe(false);
    if (result.filtered) return;
    expect(result.message.event).toBe('conversation_updated');
  });

  it('normaliza audio com media', () => {
    const result = svc.normalize(
      basePayload({
        content_type: 'text',
        attachments: [{ file_type: 'audio', data_url: 'https://chatwoot/audio.ogg', file_size: 50000 }],
      }),
      inboxConfig,
    );
    expect(result.filtered).toBe(false);
    if (result.filtered) return;
    expect(result.message.contentType).toBe('audio');
    expect(result.message.media?.url).toBe('https://chatwoot/audio.ogg');
    expect(result.message.media?.viewOnce).toBe(false);
  });

  it('view_once: media.url sempre vazio', () => {
    const result = svc.normalize(
      basePayload({
        content_type: 'view_once',
        attachments: [{ file_type: 'image', data_url: 'https://chatwoot/secret.jpg' }],
      }),
      inboxConfig,
    );
    expect(result.filtered).toBe(false);
    if (result.filtered) return;
    expect(result.message.media?.url).toBe('');
    expect(result.message.media?.viewOnce).toBe(true);
  });

  it('normaliza timestamp Unix number', () => {
    const result = svc.normalize(basePayload({ created_at: 1746144000 }), inboxConfig);
    expect(result.filtered).toBe(false);
    if (result.filtered) return;
    expect(result.message.timestamp).toBe(1746144000 * 1000);
  });

  it('normaliza timestamp ISO string (canal API do Chatwoot)', () => {
    const result = svc.normalize(
      basePayload({ created_at: '2026-05-11T15:23:58.009Z' as unknown as number }),
      inboxConfig,
    );
    expect(result.filtered).toBe(false);
    if (result.filtered) return;
    expect(result.message.timestamp).toBe(new Date('2026-05-11T15:23:58.009Z').getTime());
  });
});
