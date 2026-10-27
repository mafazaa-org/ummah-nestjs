import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CommentsService, CommentDto, CommentPageDto } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/auth-mode.decorator';

@Controller('posts/:postId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser('id') userId: string,
    @Param('postId', new ParseUUIDPipe()) postId: string,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentDto> {
    return this.commentsService.createComment(postId, userId, dto);
  }

  @Get()
  @Public()
  findAll(
    @Param('postId', new ParseUUIDPipe()) postId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<CommentPageDto> {
    return this.commentsService.getComments(postId, query);
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser('id') userId: string,
    @Param('postId', new ParseUUIDPipe()) postId: string,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
  ): Promise<void> {
    await this.commentsService.deleteComment(postId, commentId, userId);
  }
}
