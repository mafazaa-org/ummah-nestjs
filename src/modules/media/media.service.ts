import { Injectable, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AppException } from '../../common/exceptions/app.exception';
import { classifyContentType } from '../../common/constants/media.constants';
import { MediaKeyVerifier, MediaPurpose } from '../../common/media/media-key-verifier';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from './s3.service';
import { PresignDto } from './dto/presign.dto';
import { PresignResponse, VerifiedMedia } from './media.types';

@Injectable()
export class MediaService implements MediaKeyVerifier {
  private readonly imageMaxBytes: number;
  private readonly videoMaxBytes: number;
  private readonly videoMaxSeconds: number;
  private readonly presignExpiresSeconds: number;

  constructor(
    private readonly config: ConfigService,
    private readonly s3: S3Service,
    private readonly prisma: PrismaService,
  ) {
    this.imageMaxBytes = Number(this.config.getOrThrow<number>('IMAGE_MAX_BYTES'));
    this.videoMaxBytes = Number(this.config.getOrThrow<number>('VIDEO_MAX_BYTES'));
    this.videoMaxSeconds = Number(this.config.getOrThrow<number>('VIDEO_MAX_SECONDS'));
    this.presignExpiresSeconds = Number(this.config.getOrThrow<number>('PRESIGN_EXPIRES_SECONDS'));
  }

  async presign(userId: string, dto: PresignDto): Promise<PresignResponse> {
    const classification = classifyContentType(dto.contentType);
    if (!classification || classification.type !== dto.type) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'contentType does not match type',
      );
    }

    const maxBytes = dto.type === 'IMAGE' ? this.imageMaxBytes : this.videoMaxBytes;
    if (dto.sizeBytes > maxBytes) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        `sizeBytes exceeds ${maxBytes}`,
      );
    }

    if (dto.type === 'VIDEO') {
      if (!dto.durationSeconds || dto.durationSeconds > this.videoMaxSeconds) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          `durationSeconds must be between 1 and ${this.videoMaxSeconds}`,
        );
      }
    }

    const ext = classification.expectedExt;
    const key = `media/${userId}/${randomUUID()}.${ext}`;

    const uploadUrl = await this.s3.presignPut(
      key,
      dto.contentType,
      dto.sizeBytes,
      this.presignExpiresSeconds,
    );

    return {
      uploadUrl,
      key,
      method: 'PUT',
      headers: {
        'Content-Type': dto.contentType,
      },
      expiresAt: new Date(Date.now() + this.presignExpiresSeconds * 1000).toISOString(),
    };
  }

  async verifyMediaKeys(
    userId: string,
    keys: string[],
    purpose: MediaPurpose,
  ): Promise<VerifiedMedia[]> {
    const prefix = `media/${userId}/`;

    // 1) Ownership check FIRST (before any storage I/O)
    for (const key of keys) {
      if (!key.startsWith(prefix)) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'MEDIA_NOT_OWNED',
          'Media key does not belong to the current user',
        );
      }
    }

    // 2) Parallel HEAD verification with deterministic error handling (Decision D1: allSettled)
    const headResults = await Promise.allSettled(
      keys.map(async (key, position) => {
        const head = await this.s3.headObject(key);
        const classification = classifyContentType(head.contentType);
        const ext = key.split('.').pop()?.toLowerCase();

        const maxBytes = classification?.type === 'IMAGE' ? this.imageMaxBytes : this.videoMaxBytes;

        if (
          !classification ||
          ext !== classification.expectedExt ||
          head.size < 1 ||
          head.size > maxBytes
        ) {
          throw new AppException(
            HttpStatus.BAD_REQUEST,
            'INVALID_MEDIA',
            'Media file violates type or size limits',
          );
        }

        return {
          key,
          type: classification.type,
          position,
        };
      }),
    );

    // Scan results deterministically by input index order
    const verified: VerifiedMedia[] = [];
    for (const res of headResults) {
      if (res.status === 'rejected') {
        throw res.reason;
      }
      verified.push(res.value);
    }

    // 3) Combination rules
    const videos = verified.filter((m) => m.type === 'VIDEO').length;
    if (purpose === 'AVATAR') {
      if (verified.length !== 1 || videos > 0) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'INVALID_MEDIA',
          'Media file violates type or size limits',
        );
      }
    } else if (videos > 0 && verified.length !== 1) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'INVALID_MEDIA_COMBINATION',
        'A post supports up to 4 images or exactly 1 video, not both',
      );
    }

    // 4) Reuse Guard: ensure none of the keys are already associated with another post
    const used = await this.prisma.postMedia.findFirst({
      where: { key: { in: keys } },
      select: { key: true },
    });

    if (used) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'MEDIA_ALREADY_USED',
        'Media key is already in use',
      );
    }

    return verified;
  }
}
