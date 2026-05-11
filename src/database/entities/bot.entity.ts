import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type BotProcessor = 'n8n' | 'botpress';

@Entity('bots')
export class Bot {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'enum', enum: ['n8n', 'botpress'] })
  processor!: BotProcessor;

  @Column({ name: 'webhook_url', type: 'varchar', length: 500 })
  webhookUrl!: string;

  @Column({ name: 'webhook_secret', type: 'varchar', length: 255, nullable: true })
  webhookSecret!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
