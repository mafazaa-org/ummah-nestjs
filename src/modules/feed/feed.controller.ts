import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/auth-mode.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { FeedService } from './feed.service';

@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  @Public()
  getFeed(@Query() query: PaginationQueryDto) {
    return this.feedService.getFeed(query);
  }
}
