import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  content!: string;

  @IsIn(['text'])
  contentType!: 'text';

  @IsBoolean()
  @IsOptional()
  private?: boolean;
}
