import axios, { AxiosInstance } from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ChatwootAccount } from '@database/entities/chatwoot-account.entity';
import { decrypt } from '@common/crypto/encrypt.util';

interface AccountConfig {
  accountId: number;
  baseUrl: string;
  apiToken: string;
}

interface SendMessageResponse {
  id: string | number;
}

@Injectable()
export class ChatwootAdapter {
  private readonly logger = new Logger(ChatwootAdapter.name);
  private readonly cache = new Map<number, { config: AccountConfig; expiresAt: number }>();
  private readonly cacheTtlMs = 5 * 60 * 1000;
  private readonly appSecret: string;

  constructor(
    @InjectRepository(ChatwootAccount)
    private readonly accountRepo: Repository<ChatwootAccount>,
    private readonly config: ConfigService,
  ) {
    this.appSecret = config.get<string>('appSecret')!;
  }

  async loadAccountConfig(accountId: number): Promise<AccountConfig> {
    const cached = this.cache.get(accountId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.config;
    }

    const account = await this.accountRepo.findOne({ where: { accountId } });
    if (!account) throw new Error(`Chatwoot account not found: ${accountId}`);

    const config: AccountConfig = {
      accountId,
      baseUrl: account.baseUrl,
      apiToken: decrypt(account.apiToken, this.appSecret),
    };

    this.cache.set(accountId, { config, expiresAt: Date.now() + this.cacheTtlMs });
    return config;
  }

  private buildClient(config: AccountConfig): AxiosInstance {
    return axios.create({
      baseURL: `${config.baseUrl}/api/v1/accounts/${config.accountId}`,
      headers: { api_access_token: config.apiToken },
      timeout: 10000,
      maxContentLength: 10 * 1024 * 1024,
      maxBodyLength: 10 * 1024 * 1024,
    });
  }

  async sendMessage(
    chatwootConversationId: number,
    content: string,
    isPrivate: boolean,
    accountId: number,
  ): Promise<{ messageId: string }> {
    const config = await this.loadAccountConfig(accountId);
    const client = this.buildClient(config);

    const res = await client.post<SendMessageResponse>(
      `/conversations/${chatwootConversationId}/messages`,
      { content, message_type: 'outgoing', private: isPrivate },
    );

    return { messageId: String(res.data.id) };
  }

  async assignTeam(
    chatwootConversationId: number,
    teamId: number | null,
    agentId: number | null,
    accountId: number,
  ): Promise<void> {
    const config = await this.loadAccountConfig(accountId);
    const client = this.buildClient(config);

    await client.patch(`/conversations/${chatwootConversationId}/assignments`, {
      team_id: teamId,
      assignee_id: agentId,
    });
  }

  async setConversationStatus(
    chatwootConversationId: number,
    status: 'open' | 'pending' | 'resolved' | 'snoozed',
    accountId: number,
  ): Promise<void> {
    const config = await this.loadAccountConfig(accountId);
    const client = this.buildClient(config);

    await client.patch(`/conversations/${chatwootConversationId}`, { status });
  }
}
