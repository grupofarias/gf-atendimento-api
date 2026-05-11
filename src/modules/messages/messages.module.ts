import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatwootAdapter } from '@adapters/chatwoot/chatwoot.adapter';
import { ChatwootAccount } from '@database/entities/chatwoot-account.entity';
import { ConversationsModule } from '@modules/conversations/conversations.module';

import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChatwootAccount]), ConversationsModule],
  providers: [MessagesService, ChatwootAdapter],
  controllers: [MessagesController],
})
export class MessagesModule {}
