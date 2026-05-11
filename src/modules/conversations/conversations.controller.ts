import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { ApiKeyGuard } from '@common/guards/api-key.guard';

import { ConversationActionsService } from './conversations-actions.service';
import { LabelsDto, SetStatusDto } from './dto/conversation-actions.dto';

type ListResponse = { total: number; data: unknown[] };

@ApiTags('Conversations')
@ApiSecurity('x-api-key')
@Controller('conversations')
@UseGuards(ApiKeyGuard)
export class ConversationsController {
  constructor(private readonly actions: ConversationActionsService) {}

  @Patch(':id/status')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Alterar status da conversa',
    description:
      'Muda o status da conversa no Chatwoot via toggle_status e sincroniza localmente. ' +
      'Use open para reabrir, pending para aguardar humano, resolved para encerrar. ' +
      'Se a conversa não estiver no banco local, informe ?inboxId como fallback.',
  })
  @ApiParam({ name: 'id', description: 'ID da conversa no Chatwoot', example: 14 })
  @ApiQuery({
    name: 'inboxId',
    required: false,
    description: 'ID da inbox no Chatwoot. Obrigatório se a conversa ainda não existir localmente.',
    example: 5,
  })
  @ApiBody({ type: SetStatusDto })
  @ApiResponse({ status: 200, description: 'Status alterado com sucesso', schema: { example: { status: 'ok' } } })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  @ApiResponse({ status: 500, description: 'Conversa não encontrada e inboxId não informado' })
  async setStatus(
    @Param('id', ParseIntPipe) conversationId: number,
    @Body() dto: SetStatusDto,
    @Query('inboxId') inboxId?: string,
  ): Promise<{ status: string }> {
    await this.actions.setStatus(conversationId, dto.status, inboxId ? Number(inboxId) : undefined);
    return { status: 'ok' };
  }

  @Post(':id/labels')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Adicionar etiquetas à conversa',
    description:
      'Adiciona labels à conversa no Chatwoot sem remover as existentes. ' +
      'Internamente busca as labels atuais, faz merge e reenvia tudo (Chatwoot sobrescreve na POST).',
  })
  @ApiParam({ name: 'id', description: 'ID da conversa no Chatwoot', example: 14 })
  @ApiQuery({ name: 'inboxId', required: false, description: 'Fallback de inboxId se conversa não existir localmente', example: 5 })
  @ApiBody({ type: LabelsDto })
  @ApiResponse({ status: 200, schema: { example: { status: 'ok' } } })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  async addLabels(
    @Param('id', ParseIntPipe) conversationId: number,
    @Body() dto: LabelsDto,
    @Query('inboxId') inboxId?: string,
  ): Promise<{ status: string }> {
    await this.actions.addLabels(conversationId, dto.labels, inboxId ? Number(inboxId) : undefined);
    return { status: 'ok' };
  }

  @Delete(':id/labels')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Remover etiquetas da conversa',
    description:
      'Remove labels específicas da conversa no Chatwoot. ' +
      'Busca labels atuais, filtra as informadas e reenvia as restantes.',
  })
  @ApiParam({ name: 'id', description: 'ID da conversa no Chatwoot', example: 14 })
  @ApiQuery({ name: 'inboxId', required: false, description: 'Fallback de inboxId se conversa não existir localmente', example: 5 })
  @ApiBody({ type: LabelsDto })
  @ApiResponse({ status: 200, schema: { example: { status: 'ok' } } })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  async removeLabels(
    @Param('id', ParseIntPipe) conversationId: number,
    @Body() dto: LabelsDto,
    @Query('inboxId') inboxId?: string,
  ): Promise<{ status: string }> {
    await this.actions.removeLabels(conversationId, dto.labels, inboxId ? Number(inboxId) : undefined);
    return { status: 'ok' };
  }

  @Get(':id/agents/all')
  @ApiOperation({
    summary: 'Listar todos os agentes da conta',
    description:
      'Retorna todos os agentes cadastrados na conta do Chatwoot (confirmed=true). ' +
      'Use este endpoint quando quiser ver todos os agentes, independente da inbox.',
  })
  @ApiParam({ name: 'id', description: 'ID da conversa no Chatwoot (usado para resolver accountId)', example: 14 })
  @ApiQuery({ name: 'inboxId', required: false, description: 'Fallback de inboxId se conversa não existir localmente', example: 5 })
  @ApiResponse({
    status: 200,
    description: 'Lista de agentes da conta',
    schema: { example: { total: 3, data: [{ id: 1, name: 'GF', role: 'administrator' }] } },
  })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  async getAllAgents(
    @Param('id', ParseIntPipe) conversationId: number,
    @Query('inboxId') inboxId?: string,
  ): Promise<ListResponse> {
    const data = await this.actions.getAllAgents(conversationId, inboxId ? Number(inboxId) : undefined);
    return { total: data.length, data };
  }

  @Get(':id/agents')
  @ApiOperation({
    summary: 'Listar agentes disponíveis na inbox da conversa',
    description:
      'Retorna os agentes associados à inbox desta conversa via Chatwoot inbox_members. ' +
      'Se a inbox não tiver membros explícitos, retorna agentes com role=administrator como fallback. ' +
      'Use SEMPRE este endpoint antes de chamar /handoff para obter o agentId correto pelo nome.',
  })
  @ApiParam({ name: 'id', description: 'ID da conversa no Chatwoot', example: 14 })
  @ApiQuery({ name: 'inboxId', required: false, description: 'Fallback de inboxId se conversa não existir localmente', example: 5 })
  @ApiResponse({
    status: 200,
    description: 'Lista de agentes da inbox',
    schema: { example: { total: 2, data: [{ id: 4, name: 'lucas', role: 'agent' }] } },
  })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  async getAgents(
    @Param('id', ParseIntPipe) conversationId: number,
    @Query('inboxId') inboxId?: string,
  ): Promise<ListResponse> {
    const data = await this.actions.getAgents(conversationId, inboxId ? Number(inboxId) : undefined);
    return { total: data.length, data };
  }

  @Get(':id/teams')
  @ApiOperation({
    summary: 'Listar times do Chatwoot',
    description: 'Retorna todos os times cadastrados na conta do Chatwoot associada a esta conversa.',
  })
  @ApiParam({ name: 'id', description: 'ID da conversa no Chatwoot', example: 14 })
  @ApiQuery({ name: 'inboxId', required: false, description: 'Fallback de inboxId se conversa não existir localmente', example: 5 })
  @ApiResponse({
    status: 200,
    description: 'Lista de times',
    schema: { example: { total: 1, data: [{ id: 1, name: 'Suporte' }] } },
  })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  async getTeams(
    @Param('id', ParseIntPipe) conversationId: number,
    @Query('inboxId') inboxId?: string,
  ): Promise<ListResponse> {
    const data = await this.actions.getTeams(conversationId, inboxId ? Number(inboxId) : undefined);
    return { total: data.length, data };
  }
}
