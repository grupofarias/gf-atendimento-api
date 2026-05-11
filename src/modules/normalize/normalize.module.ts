import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DedupPurgeService } from '@domain/dedup/dedup-purge.service';
import { DedupService } from '@domain/dedup/dedup.service';
import { MediaResolverService } from '@domain/media/media-resolver.service';
import { NormalizerService } from '@domain/normalize/normalizer.service';
import { InboxConfig } from '@database/entities/inbox-config.entity';
import { ProcessedEvent } from '@database/entities/processed-event.entity';
import { ContactsModule } from '@modules/contacts/contacts.module';
import { ConversationsModule } from '@modules/conversations/conversations.module';
import { MinioAdapter } from '@adapters/minio/minio.adapter';

import { NormalizeController } from './normalize.controller';
import { NormalizeService } from './normalize.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InboxConfig, ProcessedEvent]),
    ContactsModule,
    ConversationsModule,
  ],
  providers: [NormalizeService, NormalizerService, DedupService, DedupPurgeService, MediaResolverService, MinioAdapter],
  controllers: [NormalizeController],
})
export class NormalizeModule {}
