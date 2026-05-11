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
import { ProcessedEvent } from './database/entities/processed-event.entity';
import { RedisModule } from './common/redis/redis.module';
import { AdminModule } from './modules/admin/admin.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { EventsModule } from './modules/events/events.module';
import { HandoffModule } from './modules/handoff/handoff.module';
import { HealthModule } from './modules/health/health.module';
import { MessagesModule } from './modules/messages/messages.module';
import { NormalizeModule } from './modules/normalize/normalize.module';

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
          ProcessedEvent,
        ],
        migrations: ['dist/database/migrations/*.js'],
      }),
    }),
    TypeOrmModule.forFeature([ProcessedEvent]),
    ScheduleModule.forRoot(),
    RedisModule,
    AdminModule,
    NormalizeModule,
    EventsModule,
    ConversationsModule,
    MessagesModule,
    HandoffModule,
    HealthModule,
  ],
  providers: [],
})
export class AppModule {}
