import { HttpStatus } from '@nestjs/common';
import { Post } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';

type PostAccess = Pick<Post, 'authorId' | 'status'>;
export type PostMutation = 'EDIT' | 'DELETE';

export const postNotFound = () => new AppException(HttpStatus.NOT_FOUND, 'POST_NOT_FOUND', 'Post not found');

/**
 * BRD §4.9 / §4.10.
 * Rule ORDER is strictly part of the API contract: 404 -> 403 -> 409.
 */
export function assertCanMutate(
  post: PostAccess | null | undefined,
  userId: string,
  action: PostMutation,
): asserts post is PostAccess {
  if (!post) throw postNotFound();

  const isOwner = post.authorId === userId;

  if (post.status === 'DELETED' || (post.status === 'HIDDEN' && !isOwner)) {
    throw postNotFound();
  }

  if (!isOwner) {
    throw new AppException(HttpStatus.FORBIDDEN, 'NOT_POST_OWNER', 'You can only modify your own posts');
  }

  if (action === 'EDIT' && post.status === 'HIDDEN') {
    throw new AppException(HttpStatus.CONFLICT, 'POST_NOT_EDITABLE', 'Hidden posts cannot be edited');
  }
}

export function assertHasContent(text: string | null | undefined, mediaCount: number): void {
  if (!text && mediaCount === 0) {
    throw new AppException(HttpStatus.BAD_REQUEST, 'EMPTY_POST', 'Post must contain text or at least one media item');
  }
}
