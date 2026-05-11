import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Conversation } from './conversation.entity';

export type OutboxStatus = 'pending' | 'sent' | 'failed';

@Entity('outbox')
@Index(['status', 'createdAt'])
export class Outbox {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'conversation_id', type: 'integer' })
  conversationId!: number;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'webhook_url', type: 'varchar', length: 500 })
  webhookUrl!: string;

  @Column({ type: 'enum', enum: ['pending', 'sent', 'failed'], default: 'pending' })
  status!: OutboxStatus;

  @Column({ type: 'smallint', default: 0 })
  attempts!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @ManyToOne(() => Conversation)
  @JoinColumn({ name: 'conversation_id' })
  conversation!: Conversation;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
