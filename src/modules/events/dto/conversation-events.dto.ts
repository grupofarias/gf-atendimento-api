import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt } from 'class-validator';

export class ConversationUpdatedDto {
  @ApiProperty({
    description: 'ID da conversa no Chatwoot (chatwoot_conversation_id)',
    example: 14,
  })
  @IsInt()
  conversationId!: number;

  @ApiProperty({
    description: 'Indica se a conversa possui um agente atribuído. Quando true, o bot é desativado (botActive=false).',
    example: true,
  })
  @IsBoolean()
  hasAssignee!: boolean;
}

export class ConversationStatusChangedDto {
  @ApiProperty({
    description: 'ID da conversa no Chatwoot (chatwoot_conversation_id)',
    example: 14,
  })
  @IsInt()
  conversationId!: number;

  @ApiProperty({
    enum: ['open', 'pending', 'resolved', 'snoozed'],
    description: 'Novo status da conversa. Sincroniza o status local com o Chatwoot.',
    example: 'open',
  })
  @IsIn(['open', 'pending', 'resolved', 'snoozed'])
  status!: 'open' | 'pending' | 'resolved' | 'snoozed';
}
