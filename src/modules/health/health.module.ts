import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { RedisHealthIndicator } from './indicators/redis.health';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
