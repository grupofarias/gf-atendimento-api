import { Body, Controller, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { ApiKeyGuard } from '@common/guards/api-key.guard';

import { HandoffDto } from './dto/handoff.dto';
import { HandoffService } from './handoff.service';

@ApiTags('Handoff')
@ApiSecurity('x-api-key')
@Controller('conversations')
@UseGuards(ApiKeyGuard)
export class HandoffController {
  constructor(private readonly handoffService: HandoffService) {}

  @Post(':id/handoff')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Transferir conversa para atendente humano',
    description:
      'Realiza o handoff da conversa: desativa o bot, transfere para agente/time e notifica via nota privada no Chatwoot. ' +
      'Ações executadas em sequência:\n' +
      '1. Atribui ao time (POST /assignments com team_id) se teamId informado\n' +
      '2. Atribui ao agente (POST /assignments com assignee_id) se agentId informado\n' +
      '3. Muda status para pending via toggle_status\n' +
      '4. Adiciona label bot-off na conversa\n' +
      '5. Seta botActive=false no banco local\n' +
      '6. Envia nota privada com motivo, agentId e teamId\n' +
      '7. Registra no handoff_log\n\n' +
      'IMPORTANTE: Use GET /conversations/:id/agents antes deste endpoint para obter o agentId correto pelo nome do atendente.',
  })
  @ApiParam({ name: 'id', description: 'ID da conversa no Chatwoot', example: 14 })
  @ApiBody({ type: HandoffDto })
  @ApiResponse({
    status: 200,
    description: 'Handoff realizado com sucesso',
    schema: { example: { status: 'ok', botActive: false, conversationStatus: 'pending' } },
  })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  @ApiResponse({ status: 500, description: 'Conversa ou InboxConfig não encontrados' })
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
