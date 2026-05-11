import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { ApiKeyGuard } from '@common/guards/api-key.guard';

import { ConversationUpdatedDto, ConversationStatusChangedDto } from './dto/conversation-events.dto';
import { EventsService } from './events.service';

@ApiTags('Events')
@ApiSecurity('x-api-key')
@Controller('events')
@UseGuards(ApiKeyGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post('conversation-updated')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Evento: conversa atualizada (assignee mudou)',
    description:
      'Recebe notificação do n8n quando o evento conversation_updated do Chatwoot ocorre. ' +
      'Quando hasAssignee=true, indica que um agente humano foi atribuído manualmente à conversa — ' +
      'o middleware seta botActive=false no banco local, impedindo que o bot responda nas próximas mensagens.',
  })
  @ApiBody({ type: ConversationUpdatedDto })
  @ApiResponse({ status: 200, schema: { example: { status: 'ok' } } })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  async conversationUpdated(
    @Body() dto: ConversationUpdatedDto,
  ): Promise<{ status: string }> {
    await this.eventsService.handleConversationUpdated(dto.conversationId, dto.hasAssignee);
    return { status: 'ok' };
  }

  @Post('conversation-status-changed')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Evento: status da conversa mudou',
    description:
      'Recebe notificação do n8n quando o evento conversation_status_changed do Chatwoot ocorre. ' +
      'Sincroniza o status da conversa no banco local. ' +
      'Quando status=resolved, também pode ser usado para limpar estado do bot.',
  })
  @ApiBody({ type: ConversationStatusChangedDto })
  @ApiResponse({ status: 200, schema: { example: { status: 'ok' } } })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  async conversationStatusChanged(
    @Body() dto: ConversationStatusChangedDto,
  ): Promise<{ status: string }> {
    await this.eventsService.handleConversationStatusChanged(dto.conversationId, dto.status);
    return { status: 'ok' };
  }
}
