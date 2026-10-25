import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Service, S3HeadResult } from '../src/modules/media/s3.service';
import { AppException } from '../src/common/exceptions/app.exception';

export interface FakeStorageObject {
  contentType: string;
  size: number;
}

@Injectable()
export class FakeS3Service extends S3Service {
  private readonly objects = new Map<string, FakeStorageObject>();
  private nextHeadFailStatus: number | null = null;
  public headCallCount = 0;
  public currentConcurrency = 0;
  public maxConcurrency = 0;

  constructor(config: ConfigService) {
    super(config);
  }

  putFakeObject(key: string, meta: FakeStorageObject): void {
    this.objects.set(key, meta);
  }

  clearFakeObjects(): void {
    this.objects.clear();
    this.nextHeadFailStatus = null;
    this.headCallCount = 0;
    this.currentConcurrency = 0;
    this.maxConcurrency = 0;
  }

  failNextHead(status: number): void {
    this.nextHeadFailStatus = status;
  }

  override async headObject(key: string): Promise<S3HeadResult> {
    this.headCallCount++;
    this.currentConcurrency++;
    if (this.currentConcurrency > this.maxConcurrency) {
      this.maxConcurrency = this.currentConcurrency;
    }

    // Realistic micro-delay so overlapping asynchronous calls in Promise.allSettled yield to the event loop
    await new Promise((resolve) => setTimeout(resolve, 10));

    try {
      if (this.nextHeadFailStatus) {
        const status = this.nextHeadFailStatus;
        this.nextHeadFailStatus = null;
        if (status === 404) {
          throw new AppException(400, 'MEDIA_NOT_FOUND', 'One or more media files were not uploaded');
        }
        throw new AppException(502, 'STORAGE_ERROR', 'Storage service error');
      }

      const obj = this.objects.get(key);
      if (!obj) {
        throw new AppException(400, 'MEDIA_NOT_FOUND', 'One or more media files were not uploaded');
      }

      return {
        contentType: obj.contentType,
        size: obj.size,
      };
    } finally {
      this.currentConcurrency--;
    }
  }
}
