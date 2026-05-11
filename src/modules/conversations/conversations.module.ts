import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatwootAdapter } from '@adapters/chatwoot/chatwoot.adapter';
import { ChatwootAccount } from '@database/entities/chatwoot-account.entity';
import { Conversation } from '@database/entities/conversation.entity';

import { ConversationActionsService } from './conversations-actions.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, ChatwootAccount])],
  providers: [ConversationsService, ConversationActionsService, ChatwootAdapter],
  controllers: [ConversationsController],
  exports: [ConversationsService],
})
export class ConversationsModule {}
