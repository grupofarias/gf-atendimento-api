import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class HandoffDto {
  @ApiPropertyOptional({
    description: 'ID numérico do time no Chatwoot. Se informado, a conversa é atribuída ao time.',
    example: 2,
  })
  @IsInt()
  @IsOptional()
  teamId?: number;

  @ApiPropertyOptional({
    description: 'ID numérico do agente no Chatwoot. Use GET /conversations/:id/agents para obter o ID correto antes de chamar este endpoint.',
    example: 4,
  })
  @IsInt()
  @IsOptional()
  agentId?: number;

  @ApiPropertyOptional({
    description: 'Motivo do handoff. Registrado no log e exibido como nota privada na conversa do Chatwoot.',
    example: 'Cliente solicitou falar com um atendente humano',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
