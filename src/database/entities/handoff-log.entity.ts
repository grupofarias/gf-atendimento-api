import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Conversation } from './conversation.entity';

export type HandoffTrigger = 'n8n' | 'chatwoot_assignee';

@Entity('handoff_log')
export class HandoffLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'conversation_id', type: 'integer' })
  conversationId!: number;

  @Column({ name: 'triggered_by', type: 'enum', enum: ['n8n', 'chatwoot_assignee'] })
  triggeredBy!: HandoffTrigger;

  @Column({ name: 'team_id', type: 'integer', nullable: true })
  teamId!: number | null;

  @Column({ name: 'agent_id', type: 'integer', nullable: true })
  agentId!: number | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @ManyToOne(() => Conversation)
  @JoinColumn({ name: 'conversation_id' })
  conversation!: Conversation;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
