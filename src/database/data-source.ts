import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';

import { Bot } from './entities/bot.entity';
import { ChatwootAccount } from './entities/chatwoot-account.entity';
import { Contact } from './entities/contact.entity';
import { Conversation } from './entities/conversation.entity';
import { EvolutionInstance } from './entities/evolution-instance.entity';
import { HandoffLog } from './entities/handoff-log.entity';
import { InboxConfig } from './entities/inbox-config.entity';
import { ProcessedEvent } from './entities/processed-event.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
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
  migrations: ['src/database/migrations/*.ts'],
});
