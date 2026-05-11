import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class SetStatusDto {
  @ApiProperty({
    enum: ['open', 'pending', 'resolved', 'snoozed'],
    description: 'Novo status da conversa no Chatwoot',
    example: 'open',
  })
  @IsIn(['open', 'pending', 'resolved', 'snoozed'])
  status!: 'open' | 'pending' | 'resolved' | 'snoozed';
}

export class LabelsDto {
  @ApiProperty({
    type: [String],
    description: 'Array de etiquetas (labels) a adicionar ou remover',
    example: ['financeiro', 'urgente'],
  })
  @IsArray()
  @IsString({ each: true })
  labels!: string[];
}

export class SearchAgentsDto {
  @ApiPropertyOptional({ description: 'Filtro de busca por nome do agente' })
  @IsOptional()
  @IsString()
  q?: string;
}
