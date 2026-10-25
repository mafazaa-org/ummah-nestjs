import { Injectable } from '@nestjs/common';
import { Page } from '../../common/pagination/page';
import { PostDto } from '../../common/mappers/post.mapper';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { decodeCursor } from '../../common/pagination/cursor';
import { PostsService } from '../posts/posts.service';

@Injectable()
export class FeedService {
  constructor(private readonly postsService: PostsService) {}

  async getFeed(query: PaginationQueryDto): Promise<Page<PostDto>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    return this.postsService.listVisible({
      limit: query.limit,
      cursor,
    });
  }
}
