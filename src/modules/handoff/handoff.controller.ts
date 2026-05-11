import { Body, Controller, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';

import { ApiKeyGuard } from '@common/guards/api-key.guard';

import { HandoffDto } from './dto/handoff.dto';
import { HandoffService } from './handoff.service';

@Controller('conversations')
@UseGuards(ApiKeyGuard)
export class HandoffController {
  constructor(private readonly handoffService: HandoffService) {}

  @Post(':id/handoff')
  @HttpCode(200)
  async handoff(
    @Param('id', ParseIntPipe) conversationId: number,
    @Body() dto: HandoffDto,
  ): Promise<{ status: string; botActive: boolean; conversationStatus: string }> {
    return this.handoffService.handoff(
      conversationId,
      dto.teamId ?? null,
      dto.agentId ?? null,
      dto.reason ?? null,
    );
  }
}
