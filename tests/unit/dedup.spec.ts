import { QueryFailedError } from 'typeorm';

import { DedupService } from '../../src/domain/dedup/dedup.service';

const mockInsert = jest.fn();
const mockRepo = { insert: mockInsert, createQueryBuilder: jest.fn() } as never;

describe('DedupService', () => {
  let svc: DedupService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new DedupService(mockRepo);
  });

  it('primeiro evento: INSERT ok, retorna false', async () => {
    mockInsert.mockResolvedValue({ identifiers: [{ id: 1 }] });
    const result = await svc.isDuplicate('chatwoot', 'msg-001');
    expect(result).toBe(false);
    expect(mockInsert).toHaveBeenCalledWith({ source: 'chatwoot', externalId: 'msg-001' });
  });

  it('segundo evento: UNIQUE violation, retorna true', async () => {
    const err = new QueryFailedError('INSERT', [], new Error('duplicate'));
    (err as QueryFailedError & { code: string }).code = '23505';
    mockInsert.mockRejectedValue(err);

    const result = await svc.isDuplicate('chatwoot', 'msg-001');
    expect(result).toBe(true);
  });

  it('erro nao-UNIQUE e relancado', async () => {
    const err = new QueryFailedError('INSERT', [], new Error('connection lost'));
    (err as QueryFailedError & { code: string }).code = '08006';
    mockInsert.mockRejectedValue(err);

    await expect(svc.isDuplicate('chatwoot', 'msg-002')).rejects.toThrow();
  });
});
