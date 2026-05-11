import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('chatwoot_accounts')
export class ChatwootAccount {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'account_id', type: 'integer', unique: true })
  accountId!: number;

  @Column({ name: 'base_url', type: 'varchar', length: 255 })
  baseUrl!: string;

  @Column({ name: 'api_token', type: 'text' })
  apiToken!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
