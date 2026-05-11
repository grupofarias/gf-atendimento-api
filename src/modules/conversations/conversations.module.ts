import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatwootAdapter } from '@adapters/chatwoot/chatwoot.adapter';
import { ChatwootAccount } from '@database/entities/chatwoot-account.entity';
import { Conversation } from '@database/entities/conversation.entity';
import { InboxConfig } from '@database/entities/inbox-config.entity';

import { ConversationActionsService } from './conversations-actions.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, InboxConfig, ChatwootAccount])],
  providers: [ConversationsService, ConversationActionsService, ChatwootAdapter],
  controllers: [ConversationsController],
  exports: [ConversationsService],
})
export class ConversationsModule {}
