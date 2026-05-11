import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Bot } from './bot.entity';
import { ChatwootAccount } from './chatwoot-account.entity';
import { EvolutionInstance } from './evolution-instance.entity';

export type ChannelType = 'whatsapp' | 'webchat' | 'instagram' | 'facebook' | 'api';

@Entity('inbox_config')
@Index(['accountId', 'chatwootInboxId'])
export class InboxConfig {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'chatwoot_inbox_id', type: 'integer', unique: true })
  chatwootInboxId!: number;

  @Column({ name: 'account_id', type: 'integer' })
  accountId!: number;

  @Column({ name: 'evolution_instance_id', type: 'integer', nullable: true })
  evolutionInstanceId!: number | null;

  @Column({ name: 'bot_id', type: 'integer' })
  botId!: number;

  @Column({ name: 'channel_type', type: 'enum', enum: ['whatsapp', 'webchat', 'instagram', 'facebook', 'api'] })
  channelType!: ChannelType;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @ManyToOne(() => ChatwootAccount)
  @JoinColumn({ name: 'account_id', referencedColumnName: 'accountId' })
  account!: ChatwootAccount;

  @ManyToOne(() => EvolutionInstance, { nullable: true })
  @JoinColumn({ name: 'evolution_instance_id' })
  evolutionInstance!: EvolutionInstance | null;

  @ManyToOne(() => Bot)
  @JoinColumn({ name: 'bot_id' })
  bot!: Bot;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
