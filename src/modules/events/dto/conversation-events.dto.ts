import { IsBoolean, IsIn, IsInt } from 'class-validator';

export class ConversationUpdatedDto {
  @IsInt()
  conversationId!: number;

  @IsBoolean()
  hasAssignee!: boolean;
}

export class ConversationStatusChangedDto {
  @IsInt()
  conversationId!: number;

  @IsIn(['open', 'pending', 'resolved', 'snoozed'])
  status!: 'open' | 'pending' | 'resolved' | 'snoozed';
}
