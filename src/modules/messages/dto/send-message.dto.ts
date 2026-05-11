import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    description: 'Conteúdo da mensagem a ser enviada ao cliente via Chatwoot',
    example: 'Olá! Como posso ajudar você hoje?',
    minLength: 1,
  })
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiProperty({
    enum: ['text'],
    description: 'Tipo do conteúdo. Atualmente apenas text é suportado.',
    example: 'text',
  })
  @IsIn(['text'])
  contentType!: 'text';

  @ApiPropertyOptional({
    description: 'true = nota interna visível apenas para agentes. false = mensagem enviada ao cliente via WhatsApp.',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  private?: boolean;
}
