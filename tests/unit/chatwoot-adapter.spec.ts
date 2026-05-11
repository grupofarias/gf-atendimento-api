import axios from 'axios';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

import { ChatwootAdapter } from '../../src/adapters/chatwoot/chatwoot.adapter';
import { ChatwootAccount } from '../../src/database/entities/chatwoot-account.entity';
import { encrypt } from '../../src/common/crypto/encrypt.util';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const APP_SECRET = 'a'.repeat(64);
const ACCOUNT_ID = 1;

function makeAccount(): ChatwootAccount {
  return {
    id: 1,
    accountId: ACCOUNT_ID,
    baseUrl: 'https://chatwoot.example.com',
    apiToken: encrypt('token-abc', APP_SECRET),
    name: 'Test',
  } as unknown as ChatwootAccount;
}

describe('ChatwootAdapter — novos métodos', () => {
  let adapter: ChatwootAdapter;
  let accountRepo: { findOne: jest.Mock };
  let mockClient: { get: jest.Mock; post: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    accountRepo = { findOne: jest.fn().mockResolvedValue(makeAccount()) };
    mockClient = { get: jest.fn(), post: jest.fn(), delete: jest.fn() };
    mockedAxios.create = jest.fn().mockReturnValue(mockClient);

    const module = await Test.createTestingModule({
      providers: [
        ChatwootAdapter,
        { provide: getRepositoryToken(ChatwootAccount), useValue: accountRepo },
        { provide: ConfigService, useValue: { get: () => APP_SECRET } },
      ],
    }).compile();

    adapter = module.get(ChatwootAdapter);
  });

  describe('getAgents', () => {
    it('retorna lista de agentes', async () => {
      const agents = [{ id: 1, name: 'Ana', email: 'ana@gf.com' }];
      mockClient.get.mockResolvedValue({ data: agents });

      const result = await adapter.getAgents(ACCOUNT_ID);
      expect(result).toEqual(agents);
      expect(mockClient.get).toHaveBeenCalledWith('/agents', { params: undefined });
    });

    it('passa parametro de busca quando fornecido', async () => {
      mockClient.get.mockResolvedValue({ data: [] });
      await adapter.getAgents(ACCOUNT_ID, 'Ana');
      expect(mockClient.get).toHaveBeenCalledWith('/agents', { params: { q: 'Ana' } });
    });
  });

  describe('getTeams', () => {
    it('retorna lista de equipes', async () => {
      const teams = [{ id: 5, name: 'Suporte' }];
      mockClient.get.mockResolvedValue({ data: teams });

      const result = await adapter.getTeams(ACCOUNT_ID);
      expect(result).toEqual(teams);
      expect(mockClient.get).toHaveBeenCalledWith('/teams');
    });
  });

  describe('addLabels', () => {
    it('adiciona labels a conversa', async () => {
      mockClient.post.mockResolvedValue({ data: { payload: ['vip', 'urgente'] } });

      await adapter.addLabels(10, ACCOUNT_ID, ['vip', 'urgente']);
      expect(mockClient.post).toHaveBeenCalledWith('/conversations/10/labels', {
        labels: ['vip', 'urgente'],
      });
    });
  });

  describe('removeLabels', () => {
    it('remove labels de uma conversa obtendo lista atual primeiro', async () => {
      mockClient.get.mockResolvedValue({ data: { payload: ['vip', 'urgente', 'teste'] } });
      mockClient.post.mockResolvedValue({ data: { payload: ['teste'] } });

      await adapter.removeLabels(10, ACCOUNT_ID, ['vip', 'urgente']);
      expect(mockClient.get).toHaveBeenCalledWith('/conversations/10/labels');
      expect(mockClient.post).toHaveBeenCalledWith('/conversations/10/labels', {
        labels: ['teste'],
      });
    });
  });
});
