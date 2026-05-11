import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';

import { ApiKeyGuard } from '@common/guards/api-key.guard';
import { ChatwootWebhookPayload } from '@domain/normalize/normalizer.service';

import { NormalizeService, NormalizeResult } from './normalize.service';

@Controller('normalize')
@UseGuards(ApiKeyGuard)
export class NormalizeController {
  constructor(private readonly normalizeService: NormalizeService) {}

  @Post()
  @HttpCode(200)
  async normalize(@Body() payload: ChatwootWebhookPayload): Promise<NormalizeResult> {
    return this.normalizeService.process(payload);
  }
}
