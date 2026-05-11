import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';

import { ApiKeyGuard } from '@common/guards/api-key.guard';

import { ConversationUpdatedDto, ConversationStatusChangedDto } from './dto/conversation-events.dto';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(ApiKeyGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post('conversation-updated')
  @HttpCode(200)
  async conversationUpdated(
    @Body() dto: ConversationUpdatedDto,
  ): Promise<{ status: string }> {
    await this.eventsService.handleConversationUpdated(dto.conversationId, dto.hasAssignee);
    return { status: 'ok' };
  }

  @Post('conversation-status-changed')
  @HttpCode(200)
  async conversationStatusChanged(
    @Body() dto: ConversationStatusChangedDto,
  ): Promise<{ status: string }> {
    await this.eventsService.handleConversationStatusChanged(dto.conversationId, dto.status);
    return { status: 'ok' };
  }
}
