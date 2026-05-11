import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class SetStatusDto {
  @IsIn(['open', 'pending', 'resolved', 'snoozed'])
  status!: 'open' | 'pending' | 'resolved' | 'snoozed';
}

export class LabelsDto {
  @IsArray()
  @IsString({ each: true })
  labels!: string[];
}

export class SearchAgentsDto {
  @IsOptional()
  @IsString()
  q?: string;
}
