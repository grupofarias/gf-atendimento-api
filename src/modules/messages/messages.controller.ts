import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import Redis from 'ioredis';

import { ApiKeyGuard } from '@common/guards/api-key.guard';
import { REDIS_CLIENT } from '@common/redis/redis.module';

import { SendMessageDto } from './dto/send-message.dto';
import { MessagesService } from './messages.service';

const IDEMPOTENCY_TTL = 300;

@ApiTags('Messages')
@ApiSecurity('x-api-key')
@Controller('conversations')
@UseGuards(ApiKeyGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Post(':id/messages')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Enviar mensagem na conversa',
    description:
      'Envia uma mensagem via Chatwoot para o cliente ou cria uma nota interna. ' +
      'O middleware busca as credenciais do Chatwoot no banco (token decriptado AES-256-GCM), ' +
      'chama a API do Chatwoot e retorna o messageId. ' +
      'Suporta idempotência via header Idempotency-Key (TTL 5 min, armazenado no Redis). ' +
      'Use private=true para notas visíveis apenas a agentes no Chatwoot.',
  })
  @ApiParam({ name: 'id', description: 'ID da conversa no Chatwoot', example: 14 })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Chave única para evitar duplicação de mensagens (ex: UUID). TTL: 5 minutos.',
    required: false,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: SendMessageDto })
  @ApiResponse({
    status: 200,
    description: 'Mensagem enviada com sucesso',
    schema: { example: { messageId: '432', status: 'sent' } },
  })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  @ApiResponse({ status: 404, description: 'Conversa não encontrada no banco local' })
  async sendMessage(
    @Param('id', ParseIntPipe) conversationId: number,
    @Body() dto: SendMessageDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ messageId: string; status: string }> {
    if (idempotencyKey) {
      const cacheKey = `idempotency:${idempotencyKey}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as { messageId: string; status: string };
    }

    const result = await this.messagesService.sendMessage(
      conversationId,
      dto.content,
      dto.private ?? false,
    );

    if (idempotencyKey) {
      const cacheKey = `idempotency:${idempotencyKey}`;
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', IDEMPOTENCY_TTL);
    }

    return result;
  }
}
