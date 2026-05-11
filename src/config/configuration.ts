import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Min, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

export type NodeEnv = 'development' | 'production' | 'test';

const INSECURE_PATTERNS = ['change_me', 'change-me'];

function containsInsecureValue(value: string): boolean {
  return INSECURE_PATTERNS.some((p) => value.toLowerCase().includes(p));
}

class EnvironmentVariables {
  @IsEnum(['development', 'production', 'test'])
  @IsOptional()
  NODE_ENV: NodeEnv = 'development';

  @IsInt()
  @Min(1)
  @IsOptional()
  PORT: number = 3200;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  APP_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  MIDDLEWARE_API_KEY!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST!: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  REDIS_PORT: number = 6379;

  @IsString()
  @IsNotEmpty()
  MINIO_ENDPOINT!: string;

  @IsInt()
  @IsOptional()
  MINIO_PORT: number = 443;

  @IsString()
  @IsOptional()
  MINIO_USE_SSL: string = 'true';

  @IsString()
  @IsNotEmpty()
  MINIO_ACCESS_KEY!: string;

  @IsString()
  @IsNotEmpty()
  MINIO_SECRET_KEY!: string;

  @IsString()
  @IsOptional()
  MINIO_BUCKET: string = 'chatwoot';

  @IsUrl({ require_tld: false })
  @IsOptional()
  CHATWOOT_BASE_URL?: string;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  if (validated.NODE_ENV === 'production') {
    if (containsInsecureValue(validated.APP_SECRET)) {
      throw new Error(
        'APP_SECRET contém valor padrão inseguro. Gere com: openssl rand -hex 32',
      );
    }
    if (containsInsecureValue(validated.MIDDLEWARE_API_KEY)) {
      throw new Error(
        'MIDDLEWARE_API_KEY contém valor padrão inseguro. Gere com: openssl rand -hex 32',
      );
    }
  }

  return validated;
}

export default () => ({
  nodeEnv: process.env.NODE_ENV as NodeEnv ?? 'development',
  port: parseInt(process.env.PORT ?? '3200', 10),
  databaseUrl: process.env.DATABASE_URL!,
  appSecret: process.env.APP_SECRET!,
  middlewareApiKey: process.env.MIDDLEWARE_API_KEY!,
  redis: {
    host: process.env.REDIS_HOST!,
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT!,
    port: parseInt(process.env.MINIO_PORT ?? '443', 10),
    useSsl: process.env.MINIO_USE_SSL !== 'false',
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
    bucket: process.env.MINIO_BUCKET ?? 'chatwoot',
  },
  chatwootBaseUrl: process.env.CHATWOOT_BASE_URL,
});
