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

import { Contact } from './contact.entity';

export type ConversationStatus = 'open' | 'pending' | 'resolved' | 'snoozed';

@Entity('conversations')
@Index(['inboxId', 'contactId'])
export class Conversation {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'chatwoot_conversation_id', type: 'integer', unique: true })
  chatwootConversationId!: number;

  @Column({ name: 'inbox_id', type: 'integer' })
  inboxId!: number;

  @Column({ name: 'account_id', type: 'integer', nullable: true })
  accountId!: number | null;

  @Column({ name: 'contact_id', type: 'integer', nullable: true })
  contactId!: number | null;

  @Column({ name: 'bot_active', type: 'boolean', default: true })
  botActive!: boolean;

  @Column({
    type: 'enum',
    enum: ['open', 'pending', 'resolved', 'snoozed'],
    default: 'open',
  })
  status!: ConversationStatus;

  @ManyToOne(() => Contact, { nullable: true })
  @JoinColumn({ name: 'contact_id' })
  contact!: Contact | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
