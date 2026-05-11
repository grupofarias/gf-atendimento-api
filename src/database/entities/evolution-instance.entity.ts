import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('evolution_instances')
export class EvolutionInstance {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'instance_name', type: 'varchar', length: 100, unique: true })
  instanceName!: string;

  @Column({ name: 'base_url', type: 'varchar', length: 255 })
  baseUrl!: string;

  @Column({ name: 'api_key', type: 'text' })
  apiKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
