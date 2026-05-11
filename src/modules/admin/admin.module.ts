import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatwootAccount } from '@database/entities/chatwoot-account.entity';
import { InboxConfig } from '@database/entities/inbox-config.entity';

import { AdminController } from './admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ChatwootAccount, InboxConfig])],
  controllers: [AdminController],
})
export class AdminModule {}
