import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPost,
  createTestingApp,
  createUser,
  getPrisma,
  makeToken,
  resetDb,
} from '../../../../test/test-utils';

const bearer = (claims: Parameters<typeof makeToken>[0]) => `Bearer ${makeToken(claims)}`;

describe('Phase 3: User Posts & Keyset Pagination (E2E)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestingApp();
  });

  beforeEach(async () => {
    await resetDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Visibility rules (Status matrix for GET /users/:id/posts)', () => {
    it('guest sees only ACTIVE posts ordered createdAt DESC, id DESC', async () => {
      const author = await createUser(app);
      const p1 = await createPost(app, {
        authorId: author.id,
        text: 'Old Active',
        createdAt: new Date('2026-10-25T10:00:00.000Z'),
      });
      await createPost(app, {
        authorId: author.id,
        text: 'Hidden Post',
        status: 'HIDDEN',
        createdAt: new Date('2026-10-25T11:00:00.000Z'),
      });
      await createPost(app, {
        authorId: author.id,
        text: 'Deleted Post',
        status: 'DELETED',
        createdAt: new Date('2026-10-25T12:00:00.000Z'),
      });
      const p4 = await createPost(app, {
        authorId: author.id,
        text: 'New Active',
        createdAt: new Date('2026-10-25T13:00:00.000Z'),
      });

      const res = await http().get(`/users/${author.id}/posts`);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].id).toBe(p4.id);
      expect(res.body.items[1].id).toBe(p1.id);
      expect(res.body.items[0].status).toBe('ACTIVE');
      expect(res.body.items[1].status).toBe('ACTIVE');
    });

    it('author sees both ACTIVE and HIDDEN posts with status', async () => {
      const author = await createUser(app);
      const auth = bearer({ uid: author.firebaseUid });

      const pActive = await createPost(app, {
        authorId: author.id,
        text: 'Active',
        status: 'ACTIVE',
        createdAt: new Date('2026-10-25T10:00:00.000Z'),
      });
      const pHidden = await createPost(app, {
        authorId: author.id,
        text: 'Hidden',
        status: 'HIDDEN',
        createdAt: new Date('2026-10-25T11:00:00.000Z'),
      });
      await createPost(app, {
        authorId: author.id,
        text: 'Deleted',
        status: 'DELETED',
        createdAt: new Date('2026-10-25T12:00:00.000Z'),
      });

      const res = await http()
        .get(`/users/${author.id}/posts`)
        .set('Authorization', auth);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].id).toBe(pHidden.id);
      expect(res.body.items[0].status).toBe('HIDDEN');
      expect(res.body.items[1].id).toBe(pActive.id);
      expect(res.body.items[1].status).toBe('ACTIVE');
    });

    it('other authenticated user sees only ACTIVE posts', async () => {
      const author = await createUser(app);
      const stranger = await createUser(app);
      const strangerAuth = bearer({ uid: stranger.firebaseUid });

      const pActive = await createPost(app, {
        authorId: author.id,
        text: 'Active',
        status: 'ACTIVE',
      });
      await createPost(app, {
        authorId: author.id,
        text: 'Hidden',
        status: 'HIDDEN',
      });

      const res = await http()
        .get(`/users/${author.id}/posts`)
        .set('Authorization', strangerAuth);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(pActive.id);
      expect(res.body.items[0].status).toBe('ACTIVE');
    });

    it('returns 404 USER_NOT_FOUND when author does not exist or is SUSPENDED', async () => {
      const suspendedAuthor = await createUser(app, { status: 'SUSPENDED' });
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const res1 = await http().get(`/users/${nonExistentId}/posts`);
      expect(res1.status).toBe(404);
      expect(res1.body.code).toBe('USER_NOT_FOUND');

      const res2 = await http().get(`/users/${suspendedAuthor.id}/posts`);
      expect(res2.status).toBe(404);
      expect(res2.body.code).toBe('USER_NOT_FOUND');
    });

    it('rejects invalid token with 401 INVALID_TOKEN (never degraded to guest on OptionalAuth)', async () => {
      const author = await createUser(app);

      const res = await http()
        .get(`/users/${author.id}/posts`)
        .set('Authorization', 'Bearer invalid_or_expired_token');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    it('rejects suspended requester token with 403 ACCOUNT_SUSPENDED', async () => {
      const author = await createUser(app);
      const suspendedUser = await createUser(app, { status: 'SUSPENDED' });
      const auth = bearer({ uid: suspendedUser.firebaseUid });

      const res = await http()
        .get(`/users/${author.id}/posts`)
        .set('Authorization', auth);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
    });
  });

  describe('Pagination & Keyset Determinism', () => {
    it('paginates 25 posts across 3 pages without duplicates or missing items', async () => {
      const author = await createUser(app);

      // Create 25 posts with distinct increasing dates
      const baseMs = new Date('2026-10-25T10:00:00.000Z').getTime();
      for (let i = 0; i < 25; i++) {
        await createPost(app, {
          authorId: author.id,
          text: `Post #${i}`,
          createdAt: new Date(baseMs + i * 1000),
        });
      }

      // Page 1: limit=10
      const page1Res = await http().get(`/users/${author.id}/posts?limit=10`);
      expect(page1Res.status).toBe(200);
      expect(page1Res.body.items).toHaveLength(10);
      expect(page1Res.body.nextCursor).not.toBeNull();
      expect(page1Res.body.items[0].text).toBe('Post #24');
      expect(page1Res.body.items[9].text).toBe('Post #15');

      // Page 2: limit=10 with cursor from page 1
      const page2Res = await http().get(`/users/${author.id}/posts?limit=10&cursor=${page1Res.body.nextCursor}`);
      expect(page2Res.status).toBe(200);
      expect(page2Res.body.items).toHaveLength(10);
      expect(page2Res.body.nextCursor).not.toBeNull();
      expect(page2Res.body.items[0].text).toBe('Post #14');
      expect(page2Res.body.items[9].text).toBe('Post #5');

      // Page 3: limit=10 with cursor from page 2 (should return remaining 5)
      const page3Res = await http().get(`/users/${author.id}/posts?limit=10&cursor=${page2Res.body.nextCursor}`);
      expect(page3Res.status).toBe(200);
      expect(page3Res.body.items).toHaveLength(5);
      expect(page3Res.body.nextCursor).toBeNull();
      expect(page3Res.body.items[0].text).toBe('Post #4');
      expect(page3Res.body.items[4].text).toBe('Post #0');

      // Verify all 25 IDs were returned exactly once
      const allIds = [
        ...page1Res.body.items.map((p: any) => p.id),
        ...page2Res.body.items.map((p: any) => p.id),
        ...page3Res.body.items.map((p: any) => p.id),
      ];
      expect(new Set(allIds).size).toBe(25);
    });

    it('tie-breaker stability: deterministic pagination when items share the exact same createdAt', async () => {
      const author = await createUser(app);
      const sameDate = new Date('2026-10-25T12:00:00.000Z');

      // Create 5 posts with the exact same timestamp
      for (let i = 0; i < 5; i++) {
        await createPost(app, {
          authorId: author.id,
          text: `Same Timestamp Post #${i}`,
          createdAt: sameDate,
        });
      }

      // Fetch with limit=2
      const p1 = await http().get(`/users/${author.id}/posts?limit=2`);
      expect(p1.body.items).toHaveLength(2);
      expect(p1.body.nextCursor).not.toBeNull();

      const p2 = await http().get(`/users/${author.id}/posts?limit=2&cursor=${p1.body.nextCursor}`);
      expect(p2.body.items).toHaveLength(2);
      expect(p2.body.nextCursor).not.toBeNull();

      const p3 = await http().get(`/users/${author.id}/posts?limit=2&cursor=${p2.body.nextCursor}`);
      expect(p3.body.items).toHaveLength(1);
      expect(p3.body.nextCursor).toBeNull();

      const combined = [...p1.body.items, ...p2.body.items, ...p3.body.items];
      const uniqueIds = new Set(combined.map((x) => x.id));
      expect(uniqueIds.size).toBe(5);
    });

    it('new post inserted between page requests does NOT shift or duplicate items in page 2', async () => {
      const author = await createUser(app);

      for (let i = 0; i < 10; i++) {
        await createPost(app, {
          authorId: author.id,
          text: `Item ${i}`,
          createdAt: new Date(`2026-10-25T10:0${i}:00.000Z`),
        });
      }

      // Fetch page 1 (top 5, Items 9..5)
      const p1 = await http().get(`/users/${author.id}/posts?limit=5`);
      expect(p1.body.items.map((p: any) => p.text)).toEqual([
        'Item 9',
        'Item 8',
        'Item 7',
        'Item 6',
        'Item 5',
      ]);

      // Concurrent action: new post arrives with newer createdAt
      await createPost(app, {
        authorId: author.id,
        text: 'Item Brand New',
        createdAt: new Date('2026-10-25T11:00:00.000Z'),
      });

      // Fetch page 2 with p1.nextCursor (keyset condition prevents newly arrived items from shifting page 2)
      const p2 = await http().get(`/users/${author.id}/posts?limit=5&cursor=${p1.body.nextCursor}`);
      expect(p2.body.items.map((p: any) => p.text)).toEqual([
        'Item 4',
        'Item 3',
        'Item 2',
        'Item 1',
        'Item 0',
      ]);
    });

    it('returns 400 INVALID_CURSOR for malformed cursor query', async () => {
      const author = await createUser(app);

      const res = await http().get(`/users/${author.id}/posts?cursor=garbage_not_base64`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_CURSOR');
    });

    it('validates limit bounds: rejects limit < 1 or limit > 50 or limit not int', async () => {
      const author = await createUser(app);

      const rZero = await http().get(`/users/${author.id}/posts?limit=0`);
      expect(rZero.status).toBe(400);
      expect(rZero.body.code).toBe('VALIDATION_ERROR');

      const rTooBig = await http().get(`/users/${author.id}/posts?limit=51`);
      expect(rTooBig.status).toBe(400);
      expect(rTooBig.body.code).toBe('VALIDATION_ERROR');

      const rNotInt = await http().get(`/users/${author.id}/posts?limit=abc`);
      expect(rNotInt.status).toBe(400);
      expect(rNotInt.body.code).toBe('VALIDATION_ERROR');
    });

    it('uses default limit of 20 when limit param is omitted', async () => {
      const author = await createUser(app);

      for (let i = 0; i < 25; i++) {
        await createPost(app, {
          authorId: author.id,
          text: `Item ${i}`,
        });
      }

      const res = await http().get(`/users/${author.id}/posts`);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(20);
      expect(res.body.nextCursor).not.toBeNull();
    });
  });
});
