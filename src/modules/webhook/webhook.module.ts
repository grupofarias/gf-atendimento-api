import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MinioAdapter } from '@adapters/minio/minio.adapter';
import { N8nAdapter } from '@adapters/n8n/n8n.adapter';
import { ProcessedEvent } from '@database/entities/processed-event.entity';
import { InboxConfig } from '@database/entities/inbox-config.entity';
import { Outbox } from '@database/entities/outbox.entity';
import { DedupService } from '@domain/dedup/dedup.service';
import { MediaResolverService } from '@domain/media/media-resolver.service';
import { NormalizerService } from '@domain/normalize/normalizer.service';
import { OutboxWorkerService } from '@domain/outbox/outbox-worker.service';
import { ContactsModule } from '@modules/contacts/contacts.module';
import { ConversationsModule } from '@modules/conversations/conversations.module';

import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InboxConfig, ProcessedEvent, Outbox]),
    ContactsModule,
    ConversationsModule,
  ],
  providers: [
    WebhookService,
    NormalizerService,
    DedupService,
    MediaResolverService,
    MinioAdapter,
    N8nAdapter,
    OutboxWorkerService,
  ],
  controllers: [WebhookController],
})
export class WebhookModule {}
