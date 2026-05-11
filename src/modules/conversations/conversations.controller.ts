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

import { ApiKeyGuard } from '@common/guards/api-key.guard';

import { ConversationActionsService } from './conversations-actions.service';
import { LabelsDto, SearchAgentsDto, SetStatusDto } from './dto/conversation-actions.dto';

@Controller('conversations')
@UseGuards(ApiKeyGuard)
export class ConversationsController {
  constructor(private readonly actions: ConversationActionsService) {}

  @Patch(':id/status')
  @HttpCode(200)
  async setStatus(
    @Param('id', ParseIntPipe) conversationId: number,
    @Body() dto: SetStatusDto,
  ): Promise<{ status: string }> {
    await this.actions.setStatus(conversationId, dto.status);
    return { status: 'ok' };
  }

  @Post(':id/labels')
  @HttpCode(200)
  async addLabels(
    @Param('id', ParseIntPipe) conversationId: number,
    @Body() dto: LabelsDto,
  ): Promise<{ status: string }> {
    await this.actions.addLabels(conversationId, dto.labels);
    return { status: 'ok' };
  }

  @Delete(':id/labels')
  @HttpCode(200)
  async removeLabels(
    @Param('id', ParseIntPipe) conversationId: number,
    @Body() dto: LabelsDto,
  ): Promise<{ status: string }> {
    await this.actions.removeLabels(conversationId, dto.labels);
    return { status: 'ok' };
  }

  @Get(':id/agents')
  async getAgents(
    @Param('id', ParseIntPipe) conversationId: number,
    @Query() query: SearchAgentsDto,
  ): Promise<unknown[]> {
    return this.actions.getAgents(conversationId, query.q);
  }

  @Get(':id/teams')
  async getTeams(
    @Param('id', ParseIntPipe) conversationId: number,
  ): Promise<unknown[]> {
    return this.actions.getTeams(conversationId);
  }
}
