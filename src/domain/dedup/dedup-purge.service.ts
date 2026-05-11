import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { OutboxWorkerService } from '@domain/outbox/outbox-worker.service';

import { DedupService } from './dedup.service';

@Injectable()
export class DedupPurgeService {
  private readonly logger = new Logger(DedupPurgeService.name);

  constructor(
    private readonly dedup: DedupService,
    private readonly outboxWorker: OutboxWorkerService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purge(): Promise<void> {
    const dedupDeleted = await this.dedup.purgeExpired();
    const outboxDeleted = await this.outboxWorker.purgeSent();
    this.logger.log(`Purge complete: processed_events=${dedupDeleted} outbox=${outboxDeleted}`);
  }
}
