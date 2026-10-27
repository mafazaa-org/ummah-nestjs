import { Injectable, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaUrlService } from '../../common/media/media-url.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { decodeCursor, encodeCursor, afterCursorWhere } from '../../common/pagination/cursor';

export interface CommentAuthorDto {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface CommentDto {
  id: string;
  postId: string;
  text: string;
  author: CommentAuthorDto;
  createdAt: string;
}

export interface CommentPageDto {
  items: CommentDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaUrl: MediaUrlService,
  ) {}

  async createComment(postId: string, userId: string, dto: CreateCommentDto): Promise<CommentDto> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Check post existence & ACTIVE status
      const post = await tx.post.findFirst({
        where: { id: postId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!post) {
        throw new AppException(HttpStatus.NOT_FOUND, 'POST_NOT_FOUND', 'Post not found or unavailable');
      }

      // 2. Check user status
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true },
      });
      if (!user || user.status === 'SUSPENDED') {
        throw new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_SUSPENDED', 'Account is suspended');
      }

      // 3. Atomically create comment & increment commentsCount
      const comment = await tx.comment.create({
        data: {
          postId,
          authorId: userId,
          text: dto.text,
          status: 'ACTIVE',
        },
        include: {
          author: {
            select: { id: true, displayName: true, avatarKey: true },
          },
        },
      });

      await tx.post.update({
        where: { id: postId },
        data: { commentsCount: { increment: 1 } },
      });

      return {
        id: comment.id,
        postId: comment.postId,
        text: comment.text,
        author: {
          id: comment.author.id,
          displayName: comment.author.displayName,
          avatarUrl: this.mediaUrl.build(comment.author.avatarKey),
        },
        createdAt: comment.createdAt.toISOString(),
      };
    });
  }

  async getComments(postId: string, query: PaginationQueryDto): Promise<CommentPageDto> {
    // 1. Verify post is ACTIVE
    const post = await this.prisma.post.findFirst({
      where: { id: postId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!post) {
      throw new AppException(HttpStatus.NOT_FOUND, 'POST_NOT_FOUND', 'Post not found or unavailable');
    }

    // 2. Decode cursor if present
    const cursorObj = query.cursor ? decodeCursor(query.cursor) : null;

    // 3. Fetch rows with limit + 1
    const rows = await this.prisma.comment.findMany({
      where: {
        postId,
        status: 'ACTIVE',
        ...(cursorObj ? afterCursorWhere(cursorObj) : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        author: {
          select: { id: true, displayName: true, avatarKey: true },
        },
      },
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;

    const nextCursor =
      hasMore && items.length > 0
        ? encodeCursor({
            createdAt: items[items.length - 1].createdAt,
            id: items[items.length - 1].id,
          })
        : null;

    return {
      items: items.map((c) => ({
        id: c.id,
        postId: c.postId,
        text: c.text,
        author: {
          id: c.author.id,
          displayName: c.author.displayName,
          avatarUrl: this.mediaUrl.build(c.author.avatarKey),
        },
        createdAt: c.createdAt.toISOString(),
      })),
      nextCursor,
      hasMore,
    };
  }

  async deleteComment(postId: string, commentId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.findFirst({
        where: { id: commentId, postId, status: 'ACTIVE' },
        include: {
          post: { select: { id: true, authorId: true } },
        },
      });

      if (!comment) {
        throw new AppException(HttpStatus.NOT_FOUND, 'COMMENT_NOT_FOUND', 'Comment not found');
      }

      // Check deletion authority: comment author OR post owner
      const isCommentAuthor = comment.authorId === userId;
      const isPostAuthor = comment.post.authorId === userId;

      if (!isCommentAuthor && !isPostAuthor) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'FORBIDDEN',
          'You do not have permission to delete this comment',
        );
      }

      // Soft delete
      await tx.comment.update({
        where: { id: commentId },
        data: { status: 'DELETED' },
      });

      // Atomically decrement commentsCount on post
      await tx.post.update({
        where: { id: postId },
        data: {
          commentsCount: {
            decrement: 1,
          },
        },
      });
    });
  }
}
