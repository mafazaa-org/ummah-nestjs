import { Module } from '@nestjs/common';
import { MEDIA_KEY_VERIFIER } from '../../common/media/media-key-verifier';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { S3Service } from './s3.service';

@Module({
  controllers: [MediaController],
  providers: [
    S3Service,
    MediaService,
    {
      provide: MEDIA_KEY_VERIFIER,
      useExisting: MediaService,
    },
  ],
  exports: [S3Service, MediaService, MEDIA_KEY_VERIFIER],
})
export class MediaModule {}
