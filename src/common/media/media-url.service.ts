import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MediaUrlService {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    // Validated at boot: a valid URL without a trailing slash.
    this.baseUrl = config.getOrThrow<string>('MEDIA_PUBLIC_BASE_URL');
  }

  /** `${MEDIA_PUBLIC_BASE_URL}/${key}` or null when there is no key. */
  build(key: string): string;
  build(key: string | null | undefined): string | null;
  build(key: string | null | undefined): string | null {
    return key ? `${this.baseUrl}/${key}` : null;
  }
}

