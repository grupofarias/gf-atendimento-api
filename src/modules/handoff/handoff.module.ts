import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatwootAdapter } from '@adapters/chatwoot/chatwoot.adapter';
import { ChatwootAccount } from '@database/entities/chatwoot-account.entity';
import { HandoffLog } from '@database/entities/handoff-log.entity';
import { ConversationsModule } from '@modules/conversations/conversations.module';

import { HandoffController } from './handoff.controller';
import { HandoffService } from './handoff.service';

@Module({
  imports: [TypeOrmModule.forFeature([HandoffLog, ChatwootAccount]), ConversationsModule],
  providers: [HandoffService, ChatwootAdapter],
  controllers: [HandoffController],
})
export class HandoffModule {}
