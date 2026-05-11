import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { ProcessedEvent } from '@database/entities/processed-event.entity';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class DedupService {
  private readonly logger = new Logger(DedupService.name);

  constructor(
    @InjectRepository(ProcessedEvent)
    private readonly repo: Repository<ProcessedEvent>,
  ) {}

  async isDuplicate(source: string, externalId: string): Promise<boolean> {
    try {
      await this.repo.insert({ source, externalId });
      return false;
    } catch (err) {
      if (err instanceof QueryFailedError && (err as QueryFailedError & { code: string }).code === PG_UNIQUE_VIOLATION) {
        this.logger.debug(`Duplicate event discarded source=${source} externalId=${externalId}`);
        return true;
      }
      throw err;
    }
  }

  async purgeExpired(): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where(`created_at < NOW() - INTERVAL '48 hours'`)
      .execute();
    return result.affected ?? 0;
  }
}
