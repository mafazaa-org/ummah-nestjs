import { MediaType, Prisma } from '@prisma/client';
import { MediaUrlService } from '../media/media-url.service';

export const POST_WITH_RELATIONS = Prisma.validator<Prisma.PostInclude>()({
  media: { orderBy: { position: 'asc' }, select: { key: true, type: true, position: true } },
  author: { select: { id: true, displayName: true, avatarKey: true } },
});

export type PostWithRelations = Prisma.PostGetPayload<{ include: typeof POST_WITH_RELATIONS }>;

export interface MediaDto {
  url: string;
  type: MediaType;
  position: number;
}

export interface AuthorSummaryDto {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface PostDto {
  id: string;
  text: string | null;
  media: MediaDto[];
  status: 'ACTIVE' | 'HIDDEN';
  author: AuthorSummaryDto;
  createdAt: string;
}

/**
 * The ONLY place post responses are shaped.
 * Explicit field copy: reportCount/updatedAt/authorId/raw keys never leak (BRD §4.0 display rules).
 */
export function toPostDto(post: PostWithRelations, mediaUrl: MediaUrlService): PostDto {
  if (post.status === 'DELETED') {
    throw new Error('toPostDto invariant violated: DELETED posts are never serialized');
  }
  return {
    id: post.id,
    text: post.text,
    media: post.media.map((m) => ({
      url: mediaUrl.build(m.key),
      type: m.type,
      position: m.position,
    })),
    status: post.status,
    author: {
      id: post.author.id,
      displayName: post.author.displayName,
      avatarUrl: mediaUrl.build(post.author.avatarKey),
    },
    createdAt: post.createdAt.toISOString(),
  };
}
