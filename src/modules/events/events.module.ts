import { Module } from '@nestjs/common';

import { ConversationsModule } from '@modules/conversations/conversations.module';

import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [ConversationsModule],
  providers: [EventsService],
  controllers: [EventsController],
})
export class EventsModule {}
