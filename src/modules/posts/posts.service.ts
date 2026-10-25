import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { POST_WITH_RELATIONS, PostDto, toPostDto } from '../../common/mappers/post.mapper';
import { MEDIA_KEY_VERIFIER, MediaKeyVerifier } from '../../common/media/media-key-verifier';
import { MediaUrlService } from '../../common/media/media-url.service';
import { Cursor, afterCursorWhere, decodeCursor } from '../../common/pagination/cursor';
import { Page, buildPage } from '../../common/pagination/page';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { isRecordNotFound, isUniqueViolation } from '../../common/utils/prisma-errors';
import { visiblePostWhere } from '../../common/utils/status-filters';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostMutation, assertCanMutate, assertHasContent, postNotFound } from './posts.policy';

export interface ListPostsQuery {
  limit: number;
  cursor: Cursor | null;
  authorId?: string;
  includeHiddenForAuthorId?: string;
}

const ACCESS_SELECT = { authorId: true, status: true } as const;

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaUrl: MediaUrlService,
    private readonly users: UsersService,
    @Inject(MEDIA_KEY_VERIFIER) private readonly mediaVerifier: MediaKeyVerifier,
  ) {}

  async create(authorId: string, dto: CreatePostDto): Promise<PostDto> {
    const text = dto.text || null; // already sanitized by DTO: '' or undefined becomes null
    const keys = dto.mediaKeys ?? [];
    assertHasContent(text, keys.length);

    const media = keys.length ? await this.mediaVerifier.verifyMediaKeys(authorId, keys, 'POST') : [];

    try {
      const post = await this.prisma.post.create({
        data: {
          authorId,
          text,
          media: {
            create: media.map(({ key, type, position }) => ({ key, type, position })),
          },
        },
        include: POST_WITH_RELATIONS,
      });
      return toPostDto(post, this.mediaUrl);
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new AppException(HttpStatus.CONFLICT, 'MEDIA_ALREADY_USED', 'Media key is already in use');
      }
      throw e;
    }
  }

  async findVisibleById(id: string): Promise<PostDto> {
    const post = await this.prisma.post.findFirst({
      where: { AND: [{ id }, visiblePostWhere()] },
      include: POST_WITH_RELATIONS,
    });
    if (!post) throw postNotFound();
    return toPostDto(post, this.mediaUrl);
  }

  async updateText(userId: string, id: string, dto: UpdatePostDto): Promise<PostDto> {
    const current = await this.prisma.post.findUnique({
      where: { id },
      select: { ...ACCESS_SELECT, _count: { select: { media: true } } },
    });
    assertCanMutate(current, userId, 'EDIT');

    const text = dto.text || null;
    assertHasContent(text, current._count.media);

    const post = await this.guardRace(id, userId, 'EDIT', () =>
      this.prisma.post.update({
        where: { id, status: 'ACTIVE' },
        data: { text },
        include: POST_WITH_RELATIONS,
      }),
    );
    return toPostDto(post, this.mediaUrl);
  }

  async softDelete(userId: string, id: string): Promise<void> {
    const current = await this.prisma.post.findUnique({ where: { id }, select: ACCESS_SELECT });
    assertCanMutate(current, userId, 'DELETE');

    await this.guardRace(id, userId, 'DELETE', () =>
      this.prisma.post.update({
        where: { id, status: { not: 'DELETED' } },
        data: { status: 'DELETED' },
      }),
    );
  }

  async listByAuthor(authorId: string, viewerId: string | undefined, q: PaginationQueryDto): Promise<Page<PostDto>> {
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    await this.users.ensureActive(authorId);
    return this.listVisible({
      limit: q.limit,
      cursor,
      authorId,
      includeHiddenForAuthorId: viewerId === authorId ? authorId : undefined,
    });
  }

  /**
   * P6 + BRD §5.2: the single keyset-paginated post query.
   * Shared by author profile now and global Feed in Phase 4.
   */
  async listVisible(q: ListPostsQuery): Promise<Page<PostDto>> {
    const rows = await this.prisma.post.findMany({
      where: {
        AND: [
          visiblePostWhere({ includeHiddenForAuthorId: q.includeHiddenForAuthorId }),
          ...(q.authorId ? [{ authorId: q.authorId }] : []),
          ...(q.cursor ? [afterCursorWhere(q.cursor)] : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      include: POST_WITH_RELATIONS,
    });
    return buildPage(rows, q.limit, (p) => toPostDto(p, this.mediaUrl));
  }

  /**
   * The status condition in the write's WHERE closes the read->write race.
   * On P2025 we re-read and re-apply the policy so the client gets the code for the NEW state.
   */
  private async guardRace<T>(id: string, userId: string, action: PostMutation, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (e) {
      if (!isRecordNotFound(e)) throw e;
      const fresh = await this.prisma.post.findUnique({ where: { id }, select: ACCESS_SELECT });
      assertCanMutate(fresh, userId, action);
      throw e;
    }
  }
}
