import { IsInt, IsOptional, IsString } from 'class-validator';

export class HandoffDto {
  @IsInt()
  @IsOptional()
  teamId?: number;

  @IsInt()
  @IsOptional()
  agentId?: number;

  @IsString()
  @IsOptional()
  reason?: string;
}
