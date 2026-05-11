import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Health check',
    description: 'Verifica se o serviço está operacional e se a conexão com o PostgreSQL está ativa.',
  })
  @ApiResponse({
    status: 200,
    description: 'Serviço e banco de dados operacionais',
    schema: {
      example: {
        status: 'ok',
        info: { postgresql: { status: 'up' } },
        error: {},
        details: { postgresql: { status: 'up' } },
      },
    },
  })
  @ApiResponse({ status: 503, description: 'Banco de dados indisponível' })
  check() {
    return this.health.check([
      () => this.db.pingCheck('postgresql'),
    ]);
  }
}
