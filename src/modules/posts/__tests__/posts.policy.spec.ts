import { describe, expect, it } from 'vitest';
import { assertCanMutate, assertHasContent } from '../posts.policy';
import { AppException } from '../../../common/exceptions/app.exception';

describe('posts.policy.ts', () => {
  const ownerId = 'user-owner';
  const strangerId = 'user-stranger';

  describe('assertCanMutate (Table-Driven Access Control)', () => {
    interface TestCase {
      name: string;
      post: { authorId: string; status: 'ACTIVE' | 'HIDDEN' | 'DELETED' } | null;
      userId: string;
      action: 'EDIT' | 'DELETE';
      expectedStatus?: number;
      expectedCode?: string;
    }

    const cases: TestCase[] = [
      {
        name: 'null post -> 404 POST_NOT_FOUND',
        post: null,
        userId: ownerId,
        action: 'EDIT',
        expectedStatus: 404,
        expectedCode: 'POST_NOT_FOUND',
      },
      {
        name: 'DELETED post by owner for EDIT -> 404 POST_NOT_FOUND',
        post: { authorId: ownerId, status: 'DELETED' },
        userId: ownerId,
        action: 'EDIT',
        expectedStatus: 404,
        expectedCode: 'POST_NOT_FOUND',
      },
      {
        name: 'DELETED post by owner for DELETE -> 404 POST_NOT_FOUND',
        post: { authorId: ownerId, status: 'DELETED' },
        userId: ownerId,
        action: 'DELETE',
        expectedStatus: 404,
        expectedCode: 'POST_NOT_FOUND',
      },
      {
        name: 'DELETED post by stranger -> 404 POST_NOT_FOUND',
        post: { authorId: ownerId, status: 'DELETED' },
        userId: strangerId,
        action: 'EDIT',
        expectedStatus: 404,
        expectedCode: 'POST_NOT_FOUND',
      },
      {
        name: 'HIDDEN post by stranger for EDIT -> 404 POST_NOT_FOUND (not 403, stranger cannot know it exists)',
        post: { authorId: ownerId, status: 'HIDDEN' },
        userId: strangerId,
        action: 'EDIT',
        expectedStatus: 404,
        expectedCode: 'POST_NOT_FOUND',
      },
      {
        name: 'HIDDEN post by stranger for DELETE -> 404 POST_NOT_FOUND',
        post: { authorId: ownerId, status: 'HIDDEN' },
        userId: strangerId,
        action: 'DELETE',
        expectedStatus: 404,
        expectedCode: 'POST_NOT_FOUND',
      },
      {
        name: 'ACTIVE post by stranger for EDIT -> 403 NOT_POST_OWNER',
        post: { authorId: ownerId, status: 'ACTIVE' },
        userId: strangerId,
        action: 'EDIT',
        expectedStatus: 403,
        expectedCode: 'NOT_POST_OWNER',
      },
      {
        name: 'ACTIVE post by stranger for DELETE -> 403 NOT_POST_OWNER',
        post: { authorId: ownerId, status: 'ACTIVE' },
        userId: strangerId,
        action: 'DELETE',
        expectedStatus: 403,
        expectedCode: 'NOT_POST_OWNER',
      },
      {
        name: 'HIDDEN post by owner for EDIT -> 409 POST_NOT_EDITABLE',
        post: { authorId: ownerId, status: 'HIDDEN' },
        userId: ownerId,
        action: 'EDIT',
        expectedStatus: 409,
        expectedCode: 'POST_NOT_EDITABLE',
      },
      {
        name: 'HIDDEN post by owner for DELETE -> allowed (void)',
        post: { authorId: ownerId, status: 'HIDDEN' },
        userId: ownerId,
        action: 'DELETE',
      },
      {
        name: 'ACTIVE post by owner for EDIT -> allowed (void)',
        post: { authorId: ownerId, status: 'ACTIVE' },
        userId: ownerId,
        action: 'EDIT',
      },
      {
        name: 'ACTIVE post by owner for DELETE -> allowed (void)',
        post: { authorId: ownerId, status: 'ACTIVE' },
        userId: ownerId,
        action: 'DELETE',
      },
    ];

    for (const c of cases) {
      it(c.name, () => {
        if (c.expectedStatus) {
          expect(() => assertCanMutate(c.post, c.userId, c.action)).toThrowError(AppException);
          try {
            assertCanMutate(c.post, c.userId, c.action);
          } catch (e: any) {
            expect(e.getStatus()).toBe(c.expectedStatus);
            expect(e.code).toBe(c.expectedCode);
          }
        } else {
          expect(() => assertCanMutate(c.post, c.userId, c.action)).not.toThrow();
        }
      });
    }
  });

  describe('assertHasContent', () => {
    it('throws 400 EMPTY_POST when text is null/empty and mediaCount is 0', () => {
      expect(() => assertHasContent(null, 0)).toThrowError(AppException);
      expect(() => assertHasContent('', 0)).toThrowError(AppException);
      try {
        assertHasContent(null, 0);
      } catch (e: any) {
        expect(e.getStatus()).toBe(400);
        expect(e.code).toBe('EMPTY_POST');
      }
    });

    it('passes when text is present without media', () => {
      expect(() => assertHasContent('Valid text', 0)).not.toThrow();
    });

    it('passes when media is present without text', () => {
      expect(() => assertHasContent(null, 1)).not.toThrow();
      expect(() => assertHasContent('', 2)).not.toThrow();
    });

    it('passes when both text and media are present', () => {
      expect(() => assertHasContent('Some text', 1)).not.toThrow();
    });
  });
});
