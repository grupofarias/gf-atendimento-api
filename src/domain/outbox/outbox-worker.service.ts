import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';

import { Outbox } from '@database/entities/outbox.entity';
import { InternalMessage } from '@domain/types/internal-message.type';
import { N8nAdapter } from '@adapters/n8n/n8n.adapter';

const MAX_ATTEMPTS = 3;
const RECOVERY_DELAY_MS = 30_000;

@Injectable()
export class OutboxWorkerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OutboxWorkerService.name);

  constructor(
    @InjectRepository(Outbox)
    private readonly repo: Repository<Outbox>,
    private readonly n8n: N8nAdapter,
  ) {}

  onApplicationBootstrap() {
    this.recoverPending();
  }

  async enqueue(
    conversationId: number,
    payload: InternalMessage,
    webhookUrl: string,
    webhookSecret: string | null,
  ): Promise<void> {
    const entry = this.repo.create({
      conversationId,
      payload: payload as unknown as Record<string, unknown>,
      webhookUrl,
      status: 'pending',
    });
    const saved = await this.repo.save(entry);
    setImmediate(() => this.process(saved.id, webhookUrl, webhookSecret));
  }

  async process(outboxId: number, webhookUrl: string, webhookSecret: string | null): Promise<void> {
    const entry = await this.repo.findOne({ where: { id: outboxId } });
    if (!entry || entry.status === 'sent') return;

    try {
      await this.n8n.forwardInternalMessage(
        entry.payload as unknown as InternalMessage,
        webhookUrl,
        webhookSecret,
      );

      await this.repo.update(entry.id, { status: 'sent', sentAt: new Date(), attempts: entry.attempts + 1 });
      this.logger.log(`Outbox delivered outboxId=${outboxId} conversationId=${entry.conversationId}`);
    } catch (err) {
      const attempts = entry.attempts + 1;
      const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      await this.repo.update(entry.id, {
        status,
        attempts,
        lastError: (err as Error).message,
      });
      this.logger.warn(`Outbox delivery failed outboxId=${outboxId} attempts=${attempts} status=${status}`);
    }
  }

  private async recoverPending(): Promise<void> {
    const cutoff = new Date(Date.now() - RECOVERY_DELAY_MS);

    const pending = await this.repo.find({
      where: { status: 'pending', createdAt: LessThan(cutoff) },
      order: { createdAt: 'ASC' },
      take: 100,
    });

    if (pending.length > 0) {
      this.logger.log(`Recovery: ${pending.length} pending outbox entries`);
    }

    for (const entry of pending) {
      setImmediate(() => this.process(entry.id, entry.webhookUrl, null));
    }
  }

  async purgeSent(): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where(`status = 'sent' AND sent_at < NOW() - INTERVAL '48 hours'`)
      .execute();
    return result.affected ?? 0;
  }
}
