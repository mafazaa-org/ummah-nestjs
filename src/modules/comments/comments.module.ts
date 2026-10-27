import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { MediaUrlService } from '../../common/media/media-url.service';

@Module({
  controllers: [CommentsController],
  providers: [CommentsService, MediaUrlService],
  exports: [CommentsService],
})
export class CommentsModule {}
