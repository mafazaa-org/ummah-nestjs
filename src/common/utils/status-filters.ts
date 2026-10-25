import { Prisma } from '@prisma/client';

/**
 * P6: the ONLY definition of "a post visible to the requester".
 * HIDDEN posts are included solely for their own author (BRD §4.5 / §5.4).
 */
export function visiblePostWhere(opts: { includeHiddenForAuthorId?: string } = {}): Prisma.PostWhereInput {
  return {
    author: { status: 'ACTIVE' },
    OR: opts.includeHiddenForAuthorId
      ? [{ status: 'ACTIVE' }, { status: 'HIDDEN', authorId: opts.includeHiddenForAuthorId }]
      : [{ status: 'ACTIVE' }],
  };
}
