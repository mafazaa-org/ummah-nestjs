import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { OptionalAuth } from '../../common/decorators/auth-mode.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { PostsService } from './posts.service';

@Controller('users')
export class UserPostsController {
  constructor(private readonly posts: PostsService) {}

  @Get(':id/posts')
  @OptionalAuth()
  list(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser('id') viewerId: string | undefined,
    @Query() query: PaginationQueryDto,
  ) {
    return this.posts.listByAuthor(id, viewerId, query);
  }
}
