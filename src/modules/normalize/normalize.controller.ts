import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { ApiKeyGuard } from '@common/guards/api-key.guard';
import { ChatwootWebhookPayload } from '@domain/normalize/normalizer.service';

import { NormalizeService, NormalizeResult } from './normalize.service';

@ApiTags('Normalize')
@ApiSecurity('x-api-key')
@Controller('normalize')
@UseGuards(ApiKeyGuard)
export class NormalizeController {
  constructor(private readonly normalizeService: NormalizeService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Normalizar payload do Chatwoot',
    description:
      'Recebe o payload bruto do webhook do Chatwoot e retorna uma InternalMessage normalizada para o n8n. ' +
      'Processamento interno:\n' +
      '1. Valida inbox_id e busca InboxConfig no banco\n' +
      '2. Filtra mensagens outgoing, private e activity (não devem ser processadas pelo bot)\n' +
      '3. Deduplica via Redis usando event_id (TTL 60s) — evita processamento duplicado\n' +
      '4. Normaliza telefone para formato E.164\n' +
      '5. Resolve URL de mídia via MinIO se houver attachment\n' +
      '6. Faz upsert de contact e conversation no banco local\n' +
      '7. Retorna InternalMessage com botActive indicando se o bot está ativo para esta conversa\n\n' +
      'Quando skip=true, o n8n deve ignorar e não acionar o agente de IA.\n' +
      'Quando botActive=false (label bot-off ou agente humano atribuído), o n8n também deve parar.',
  })
  @ApiBody({
    description: 'Payload bruto do webhook do Chatwoot (message_created event)',
    schema: {
      example: {
        event: 'message_created',
        message_type: 'incoming',
        content: 'Olá, preciso de ajuda',
        conversation: { id: 14, inbox_id: 5, labels: [] },
        contact: { id: 21, name: 'Igor', phone_number: '+5511933030497' },
        account: { id: 1 },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Payload normalizado ou skip com motivo',
    schema: {
      oneOf: [
        {
          title: 'Skip',
          example: { skip: true, reason: 'outgoing_message' },
        },
        {
          title: 'InternalMessage',
          example: {
            skip: false,
            botActive: true,
            message: {
              event: 'message_created',
              messageId: '432',
              conversationId: 14,
              contactId: 21,
              phone: '+5511933030497',
              inboxId: 5,
              accountId: 1,
              channelType: 'whatsapp',
              contentType: 'text',
              messageType: 'incoming',
              isPrivate: false,
              labels: ['financeiro'],
              contactName: 'Igor',
              inboxName: 'igorTestes',
              text: 'Olá, preciso de ajuda',
              chatwootUrl: 'https://chatwootpainel.infragf.com.br/app/accounts/1/conversations/14',
            },
          },
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  async normalize(@Body() payload: ChatwootWebhookPayload): Promise<NormalizeResult> {
    return this.normalizeService.process(payload);
  }
}
