import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('contacts')
@Unique('uq_contact_account_phone', ['chatwootAccountId', 'phone'])
@Index(['chatwootAccountId', 'phone'])
export class Contact {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'chatwoot_account_id', type: 'integer' })
  chatwootAccountId!: number;

  @Column({ type: 'varchar', length: 20 })
  phone!: string;

  @Column({ name: 'chatwoot_contact_id', type: 'integer', nullable: true })
  chatwootContactId!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
