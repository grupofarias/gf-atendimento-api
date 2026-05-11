import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { Repository } from 'typeorm';

import { REDIS_CLIENT } from '@common/redis/redis.module';
import { Contact } from '@database/entities/contact.entity';

const LOCK_TTL_MS = 15_000;

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    @InjectRepository(Contact)
    private readonly repo: Repository<Contact>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async upsertContact(
    chatwootAccountId: number,
    phone: string,
    chatwootContactId?: number,
  ): Promise<Contact> {
    const existing = await this.repo.findOne({ where: { chatwootAccountId, phone } });
    if (existing) return existing;

    const lockKey = `contact:lock:${chatwootAccountId}:${phone}`;
    const lockValue = Math.random().toString(36);
    const acquired = await this.redis.set(lockKey, lockValue, 'PX', LOCK_TTL_MS, 'NX');

    if (!acquired) {
      await new Promise((r) => setTimeout(r, 100));
      const found = await this.repo.findOne({ where: { chatwootAccountId, phone } });
      if (found) return found;
    }

    try {
      const contact = this.repo.create({ chatwootAccountId, phone, chatwootContactId: chatwootContactId ?? null });
      return await this.repo.save(contact);
    } catch {
      const found = await this.repo.findOne({ where: { chatwootAccountId, phone } });
      if (found) return found;
      throw new Error(`upsertContact: failed for account=${chatwootAccountId}`);
    } finally {
      const current = await this.redis.get(lockKey);
      if (current === lockValue) await this.redis.del(lockKey);
    }
  }
}
