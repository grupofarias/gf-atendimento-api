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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
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
  @ApiOperation({ summary: 'Alterar status da conversa' })
  @ApiParam({ name: 'id', description: 'ID da conversa no Chatwoot', example: 14 })
  @ApiBody({ type: SetStatusDto })
  @ApiResponse({ status: 200, schema: { example: { status: 'ok' } } })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  async setStatus(
    @Param('id', ParseIntPipe) conversationId: number,
    @Body() dto: SetStatusDto,
  ): Promise<{ status: string }> {
    await this.actions.setStatus(conversationId, dto.status);
    return { status: 'ok' };
  }

  @Post(':id/labels')
  @HttpCode(200)
  @ApiOperation({ summary: 'Adicionar etiquetas à conversa' })
  @ApiParam({ name: 'id', description: 'ID da conversa no Chatwoot', example: 14 })
  @ApiBody({ type: LabelsDto })
  @ApiResponse({ status: 200, schema: { example: { status: 'ok' } } })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  async addLabels(
    @Param('id', ParseIntPipe) conversationId: number,
    @Body() dto: LabelsDto,
  ): Promise<{ status: string }> {
    await this.actions.addLabels(conversationId, dto.labels);
    return { status: 'ok' };
  }

  @Delete(':id/labels')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remover etiquetas da conversa' })
  @ApiParam({ name: 'id', description: 'ID da conversa no Chatwoot', example: 14 })
  @ApiBody({ type: LabelsDto })
  @ApiResponse({ status: 200, schema: { example: { status: 'ok' } } })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  async removeLabels(
    @Param('id', ParseIntPipe) conversationId: number,
    @Body() dto: LabelsDto,
  ): Promise<{ status: string }> {
    await this.actions.removeLabels(conversationId, dto.labels);
    return { status: 'ok' };
  }

  @Get(':id/agents/all')
  @ApiOperation({ summary: 'Listar todos os agentes da conta' })
  @ApiParam({ name: 'id', description: 'ID da conversa no Chatwoot', example: 14 })
  @ApiResponse({ status: 200, schema: { example: { total: 3, data: [{ id: 1, name: 'GF', role: 'administrator' }] } } })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  async getAllAgents(
    @Param('id', ParseIntPipe) conversationId: number,
  ): Promise<ListResponse> {
    const data = await this.actions.getAllAgents(conversationId);
    return { total: data.length, data };
  }

  @Get(':id/agents')
  @ApiOperation({ summary: 'Listar agentes disponíveis na inbox da conversa' })
  @ApiParam({ name: 'id', description: 'ID da conversa no Chatwoot', example: 14 })
  @ApiResponse({ status: 200, schema: { example: { total: 2, data: [{ id: 4, name: 'lucas', role: 'agent' }] } } })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  async getAgents(
    @Param('id', ParseIntPipe) conversationId: number,
  ): Promise<ListResponse> {
    const data = await this.actions.getAgents(conversationId);
    return { total: data.length, data };
  }

  @Get(':id/teams')
  @ApiOperation({ summary: 'Listar times do Chatwoot' })
  @ApiParam({ name: 'id', description: 'ID da conversa no Chatwoot', example: 14 })
  @ApiResponse({ status: 200, schema: { example: { total: 1, data: [{ id: 1, name: 'Suporte' }] } } })
  @ApiResponse({ status: 401, description: 'x-api-key inválida ou ausente' })
  async getTeams(
    @Param('id', ParseIntPipe) conversationId: number,
  ): Promise<ListResponse> {
    const data = await this.actions.getTeams(conversationId);
    return { total: data.length, data };
  }
}
