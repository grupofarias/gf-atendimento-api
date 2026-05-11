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
import Redis from 'ioredis';

import { ApiKeyGuard } from '@common/guards/api-key.guard';
import { REDIS_CLIENT } from '@common/redis/redis.module';

import { SendMessageDto } from './dto/send-message.dto';
import { MessagesService } from './messages.service';

const IDEMPOTENCY_TTL = 300;

@Controller('conversations')
@UseGuards(ApiKeyGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Post(':id/messages')
  @HttpCode(200)
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
