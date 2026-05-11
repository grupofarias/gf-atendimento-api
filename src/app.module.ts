import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import configuration, { validate } from './config/configuration';
import { Bot } from './database/entities/bot.entity';
import { ChatwootAccount } from './database/entities/chatwoot-account.entity';
import { Contact } from './database/entities/contact.entity';
import { Conversation } from './database/entities/conversation.entity';
import { EvolutionInstance } from './database/entities/evolution-instance.entity';
import { HandoffLog } from './database/entities/handoff-log.entity';
import { InboxConfig } from './database/entities/inbox-config.entity';
import { Outbox } from './database/entities/outbox.entity';
import { ProcessedEvent } from './database/entities/processed-event.entity';
import { DedupPurgeService } from './domain/dedup/dedup-purge.service';
import { DedupService } from './domain/dedup/dedup.service';
import { OutboxWorkerService } from './domain/outbox/outbox-worker.service';
import { N8nAdapter } from './adapters/n8n/n8n.adapter';
import { RedisModule } from './common/redis/redis.module';
import { HandoffModule } from './modules/handoff/handoff.module';
import { HealthModule } from './modules/health/health.module';
import { MessagesModule } from './modules/messages/messages.module';
import { WebhookModule } from './modules/webhook/webhook.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('databaseUrl'),
        synchronize: false,
        logging: config.get<string>('nodeEnv') === 'development',
        entities: [
          ChatwootAccount,
          EvolutionInstance,
          Bot,
          InboxConfig,
          Contact,
          Conversation,
          HandoffLog,
          Outbox,
          ProcessedEvent,
        ],
        migrations: ['dist/database/migrations/*.js'],
      }),
    }),
    TypeOrmModule.forFeature([ProcessedEvent, Outbox]),
    ScheduleModule.forRoot(),
    RedisModule,
    WebhookModule,
    MessagesModule,
    HandoffModule,
    HealthModule,
  ],
  providers: [DedupService, DedupPurgeService, OutboxWorkerService, N8nAdapter],
})
export class AppModule {}
