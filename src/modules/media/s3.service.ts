import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppException } from '../../common/exceptions/app.exception';

export interface S3HeadResult {
  contentType: string;
  size: number;
}

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  protected readonly s3: S3Client;
  protected readonly bucket: string;

  constructor(protected readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow<string>('S3_BUCKET');
    this.s3 = new S3Client({
      endpoint: this.config.getOrThrow<string>('S3_ENDPOINT'),
      region: this.config.get<string>('S3_REGION', 'auto'),
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
      // Essential for Cloudflare R2 and pre-signed PUT without extra checksum query parameters
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  }

  async presignPut(
    key: string,
    contentType: string,
    sizeBytes: number,
    expiresInSeconds: number,
  ): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });

    return getSignedUrl(this.s3, cmd, {
      expiresIn: expiresInSeconds,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
  }

  async headObject(key: string): Promise<S3HeadResult> {
    try {
      const res = await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      return {
        contentType: res.ContentType ?? '',
        size: res.ContentLength ?? 0,
      };
    } catch (e: any) {
      if (e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) {
        throw new AppException(400, 'MEDIA_NOT_FOUND', 'One or more media files were not uploaded');
      }

      // Log internal error safely without exposing raw tokens/URLs
      this.logger.error(`S3 HEAD failed for key ${key}: ${e?.message ?? e}`);
      throw new AppException(502, 'STORAGE_ERROR', 'Storage service error');
    }
  }
}
