import { Injectable } from '@nestjs/common';

import { MinioAdapter, MediaResolution } from '@adapters/minio/minio.adapter';
import { MediaInfo } from '@domain/types/internal-message.type';

@Injectable()
export class MediaResolverService {
  constructor(private readonly minio: MinioAdapter) {}

  async resolve(media: MediaInfo): Promise<MediaInfo> {
    if (media.viewOnce) {
      return { ...media, url: '' };
    }

    if (!media.url) {
      return media;
    }

    const resolved: MediaResolution = await this.minio.resolveMediaUrl(media.url);

    return { ...media, url: resolved.url, error: resolved.error };
  }
}
