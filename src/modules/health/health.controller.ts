import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import axios from 'axios';

import { RedisHealthIndicator } from './indicators/redis.health';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator,
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Health check',
    description: 'Verifica se o serviço e todas as dependências estão operacionais.',
  })
  @ApiResponse({
    status: 200,
    description: 'Todas as dependências operacionais',
    schema: {
      example: {
        status: 'ok',
        info: {
          postgresql: { status: 'up' },
          redis: { status: 'up' },
          minio: { status: 'up' },
          chatwoot: { status: 'up' },
        },
        error: {},
        details: {
          postgresql: { status: 'up' },
          redis: { status: 'up' },
          minio: { status: 'up' },
          chatwoot: { status: 'up' },
        },
      },
    },
  })
  @ApiResponse({ status: 503, description: 'Uma ou mais dependências indisponíveis' })
  check() {
    const chatwootUrl = this.config.get<string>('chatwootBaseUrl');
    const checks = [
      () => this.db.pingCheck('postgresql'),
      () => this.redisHealth.check('redis'),
      () => this.checkHttp('minio', this.buildMinioUrl()),
    ];
    if (chatwootUrl) {
      checks.push(() => this.checkHttp('chatwoot', `${chatwootUrl}/auth/sign_in`));
    }
    return this.health.check(checks);
  }

  private buildMinioUrl(): string {
    const endpoint = this.config.get<string>('minio.endpoint');
    const port = this.config.get<number>('minio.port');
    const useSsl = this.config.get<boolean>('minio.useSsl');
    const scheme = useSsl ? 'https' : 'http';
    return `${scheme}://${endpoint}:${port}/minio/health/live`;
  }

  private async checkHttp(key: string, url: string) {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await axios.get(url, { timeout: 2000, validateStatus: () => true });
      return indicator.up();
    } catch {
      return indicator.down();
    }
  }
}
