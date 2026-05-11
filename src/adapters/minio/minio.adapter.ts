import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MediaResolution {
  url: string;
  error?: string;
}

@Injectable()
export class MinioAdapter {
  private readonly logger = new Logger(MinioAdapter.name);
  private readonly minioBase: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = config.get<string>('minio.endpoint');
    const port = config.get<number>('minio.port');
    const ssl = config.get<boolean>('minio.useSsl');
    const scheme = ssl ? 'https' : 'http';
    this.minioBase = port === 443 || port === 80 ? `${scheme}://${endpoint}` : `${scheme}://${endpoint}:${port}`;
  }

  async resolveMediaUrl(activeStorageUrl: string): Promise<MediaResolution> {
    try {
      const response = await axios.get(activeStorageUrl, {
        maxRedirects: 0,
        validateStatus: (s) => s === 302 || s === 301 || (s >= 200 && s < 300),
        timeout: 5000,
        maxContentLength: 1024,
        maxBodyLength: 1024,
      });

      const location = response.headers['location'] as string | undefined;
      if (location && (location.includes(this.minioBase) || location.includes('s3minio'))) {
        return { url: location };
      }

      if (location) {
        return { url: location };
      }

      if (response.request?.res?.responseUrl) {
        return { url: response.request.res.responseUrl as string };
      }

      return { url: activeStorageUrl };
    } catch (err) {
      this.logger.warn(`Media resolution failed for URL (omitted): ${(err as Error).message}`);
      return { url: '', error: 'unresolvable' };
    }
  }
}
