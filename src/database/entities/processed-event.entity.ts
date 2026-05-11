import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('processed_events')
@Unique('uq_processed_events_source_external', ['source', 'externalId'])
@Index(['createdAt'])
export class ProcessedEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 50 })
  source!: string;

  @Column({ name: 'external_id', type: 'varchar', length: 255 })
  externalId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
