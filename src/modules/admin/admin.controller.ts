import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ApiKeyGuard } from '@common/guards/api-key.guard';
import { encrypt } from '@common/crypto/encrypt.util';
import { ChatwootAccount } from '@database/entities/chatwoot-account.entity';
import { InboxConfig } from '@database/entities/inbox-config.entity';

import { adminHtml } from './admin.html';

@ApiExcludeController()
@Controller('admin')
export class AdminController {
  private readonly appSecret: string;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(ChatwootAccount)
    private readonly accounts: Repository<ChatwootAccount>,
    @InjectRepository(InboxConfig)
    private readonly inboxes: Repository<InboxConfig>,
  ) {
    this.appSecret = config.get<string>('appSecret')!;
  }

  @Get()
  page(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(adminHtml);
  }

  // --- Accounts ---

  @Get('accounts')
  @UseGuards(ApiKeyGuard)
  listAccounts() {
    return this.accounts.find({ select: ['id', 'accountId', 'baseUrl', 'createdAt'] });
  }

  @Post('accounts')
  @UseGuards(ApiKeyGuard)
  async createAccount(
    @Body() body: { accountId: number; baseUrl: string; apiToken: string },
  ) {
    const account = this.accounts.create({
      accountId: body.accountId,
      baseUrl: body.baseUrl,
      apiToken: encrypt(body.apiToken, this.appSecret),
    });
    return this.accounts.save(account).then((a) => ({
      id: a.id,
      accountId: a.accountId,
      baseUrl: a.baseUrl,
    }));
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  @UseGuards(ApiKeyGuard)
  async deleteAccount(@Param('id', ParseIntPipe) id: number) {
    const result = await this.accounts.delete(id);
    if (!result.affected) throw new NotFoundException();
  }

  // --- Inbox Config ---

  @Get('inboxes')
  @UseGuards(ApiKeyGuard)
  listInboxes() {
    return this.inboxes.find({
      select: ['id', 'chatwootInboxId', 'accountId', 'channelType', 'active'],
    });
  }

  @Post('inboxes')
  @UseGuards(ApiKeyGuard)
  createInbox(
    @Body() body: {
      chatwootInboxId: number;
      accountId: number;
      channelType: 'whatsapp' | 'webchat' | 'instagram' | 'facebook' | 'api';
    },
  ) {
    return this.inboxes.save(this.inboxes.create({ ...body, botId: null }));
  }

  @Delete('inboxes/:id')
  @HttpCode(204)
  @UseGuards(ApiKeyGuard)
  async deleteInbox(@Param('id', ParseIntPipe) id: number) {
    const result = await this.inboxes.delete(id);
    if (!result.affected) throw new NotFoundException();
  }
}
