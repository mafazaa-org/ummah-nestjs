import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPost,
  createTestingApp,
  createUser,
  putFakeImage,
  resetDb,
} from '../../../../test/test-utils';

describe('Phase 4: Chronological Feed & Keyset Pagination (E2E)', () => {
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

  describe('Public Access & Token Immunity', () => {
    it('allows unauthenticated guest access to GET /feed and returns active posts', async () => {
      const author = await createUser(app, { displayName: 'Public Author' });
      const post = await createPost(app, {
        authorId: author.id,
        text: 'Feed Post For All',
      });

      const res = await http().get('/feed');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(post.id);
      expect(res.body.items[0].text).toBe('Feed Post For All');
      expect(res.body.items[0].author.displayName).toBe('Public Author');
    });

    it('ignores invalid or expired bearer token and responds with 200 (Token Immunity)', async () => {
      const author = await createUser(app);
      await createPost(app, { authorId: author.id, text: 'Feed Post' });

      const res = await http()
        .get('/feed')
        .set('Authorization', 'Bearer invalid_or_expired_or_corrupt_token');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
    });
  });

  describe('Status Filtering & Security Isolation', () => {
    it('completely excludes HIDDEN posts from the feed', async () => {
      const author = await createUser(app);
      await createPost(app, { authorId: author.id, text: 'Active One', status: 'ACTIVE' });
      await createPost(app, { authorId: author.id, text: 'Hidden One', status: 'HIDDEN' });

      const res = await http().get('/feed');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].text).toBe('Active One');
    });

    it('completely excludes DELETED posts from the feed', async () => {
      const author = await createUser(app);
      await createPost(app, { authorId: author.id, text: 'Active One', status: 'ACTIVE' });
      await createPost(app, { authorId: author.id, text: 'Deleted One', status: 'DELETED' });

      const res = await http().get('/feed');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].text).toBe('Active One');
    });

    it('completely excludes posts by SUSPENDED users even if post status is ACTIVE', async () => {
      const activeAuthor = await createUser(app, { status: 'ACTIVE' });
      const suspendedAuthor = await createUser(app, { status: 'SUSPENDED' });

      await createPost(app, { authorId: activeAuthor.id, text: 'Allowed Post', status: 'ACTIVE' });
      await createPost(app, { authorId: suspendedAuthor.id, text: 'Forbidden Post', status: 'ACTIVE' });

      const res = await http().get('/feed');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].text).toBe('Allowed Post');
      expect(res.body.items[0].author.id).toBe(activeAuthor.id);
    });

    it('returns media items with correct URLs and ensures sensitive internal fields never leak', async () => {
      const author = await createUser(app);
      const key = putFakeImage(app, author.id);

      const post = await createPost(app, {
        authorId: author.id,
        text: 'Post with image',
        media: {
          create: [{ key, type: 'IMAGE', position: 0 }],
        },
      });

      const res = await http().get('/feed');

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      const item = res.body.items[0];

      expect(item.id).toBe(post.id);
      expect(item.media).toHaveLength(1);
      expect(item.media[0]).toEqual({
        url: `${process.env.MEDIA_PUBLIC_BASE_URL}/${key}`,
        type: 'IMAGE',
        position: 0,
      });

      // Assert zero leak of sensitive database internals
      expect(item.reportCount).toBeUndefined();
      expect(item.updatedAt).toBeUndefined();
      expect(item.authorId).toBeUndefined();
      expect(item.author.firebaseUid).toBeUndefined();
      expect(item.author.reportCount).toBeUndefined();
      expect(item.media[0].key).toBeUndefined();
    });
  });

  describe('Keyset Pagination & Determinism', () => {
    it('paginates 25 posts across 3 pages with limit=10 without duplicates or missing items', async () => {
      const author = await createUser(app);
      const baseMs = new Date('2026-10-25T10:00:00.000Z').getTime();

      // Seed 25 posts with ascending timestamps
      for (let i = 0; i < 25; i++) {
        await createPost(app, {
          authorId: author.id,
          text: `Feed Post #${i}`,
          createdAt: new Date(baseMs + i * 1000),
        });
      }

      // Page 1: limit=10
      const p1 = await http().get('/feed?limit=10');
      expect(p1.status).toBe(200);
      expect(p1.body.items).toHaveLength(10);
      expect(p1.body.nextCursor).not.toBeNull();
      expect(p1.body.items[0].text).toBe('Feed Post #24'); // newest first
      expect(p1.body.items[9].text).toBe('Feed Post #15');

      // Page 2: limit=10 with p1.nextCursor
      const p2 = await http().get(`/feed?limit=10&cursor=${p1.body.nextCursor}`);
      expect(p2.status).toBe(200);
      expect(p2.body.items).toHaveLength(10);
      expect(p2.body.nextCursor).not.toBeNull();
      expect(p2.body.items[0].text).toBe('Feed Post #14');
      expect(p2.body.items[9].text).toBe('Feed Post #5');

      // Page 3: limit=10 with p2.nextCursor (remaining 5)
      const p3 = await http().get(`/feed?limit=10&cursor=${p2.body.nextCursor}`);
      expect(p3.status).toBe(200);
      expect(p3.body.items).toHaveLength(5);
      expect(p3.body.nextCursor).toBeNull(); // Terminal page
      expect(p3.body.items[0].text).toBe('Feed Post #4');
      expect(p3.body.items[4].text).toBe('Feed Post #0');

      // Verify exact 25 unique items
      const allIds = [
        ...p1.body.items.map((x: any) => x.id),
        ...p2.body.items.map((x: any) => x.id),
        ...p3.body.items.map((x: any) => x.id),
      ];
      expect(new Set(allIds).size).toBe(25);
    });

    it('new post arrival does NOT cause duplicate or shifted items in subsequent page requests', async () => {
      const author = await createUser(app);

      for (let i = 0; i < 10; i++) {
        await createPost(app, {
          authorId: author.id,
          text: `Item ${i}`,
          createdAt: new Date(`2026-10-25T10:0${i}:00.000Z`),
        });
      }

      // Fetch page 1 (5 newest: Item 9..5)
      const p1 = await http().get('/feed?limit=5');
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

      // Fetch page 2 using p1.nextCursor
      const p2 = await http().get(`/feed?limit=5&cursor=${p1.body.nextCursor}`);
      expect(p2.body.items.map((p: any) => p.text)).toEqual([
        'Item 4',
        'Item 3',
        'Item 2',
        'Item 1',
        'Item 0',
      ]);
    });

    it('preserves determinism via tie-breaker when multiple posts share the exact millisecond', async () => {
      const author = await createUser(app);
      const sameTimestamp = new Date('2026-10-25T12:00:00.000Z');

      for (let i = 0; i < 5; i++) {
        await createPost(app, {
          authorId: author.id,
          text: `Same Timestamp #${i}`,
          createdAt: sameTimestamp,
        });
      }

      const p1 = await http().get('/feed?limit=2');
      expect(p1.body.items).toHaveLength(2);
      expect(p1.body.nextCursor).not.toBeNull();

      const p2 = await http().get(`/feed?limit=2&cursor=${p1.body.nextCursor}`);
      expect(p2.body.items).toHaveLength(2);
      expect(p2.body.nextCursor).not.toBeNull();

      const p3 = await http().get(`/feed?limit=2&cursor=${p2.body.nextCursor}`);
      expect(p3.body.items).toHaveLength(1);
      expect(p3.body.nextCursor).toBeNull();

      const combined = [...p1.body.items, ...p2.body.items, ...p3.body.items];
      expect(new Set(combined.map((x) => x.id)).size).toBe(5);
    });

    it('returns empty list and null nextCursor when feed has no posts', async () => {
      const res = await http().get('/feed');
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.nextCursor).toBeNull();
    });

    it('uses default limit of 20 when limit parameter is omitted', async () => {
      const author = await createUser(app);

      for (let i = 0; i < 25; i++) {
        await createPost(app, { authorId: author.id, text: `Post ${i}` });
      }

      const res = await http().get('/feed');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(20);
      expect(res.body.nextCursor).not.toBeNull();
    });
  });

  describe('Validation & Error Handling', () => {
    it('returns 400 INVALID_CURSOR on malformed base64 cursor', async () => {
      const res = await http().get('/feed?cursor=not_a_valid_base64_string');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_CURSOR');
    });

    it('returns 400 INVALID_CURSOR on cursor with non-UUID id', async () => {
      const invalidPayload = Buffer.from(
        JSON.stringify({ c: new Date().toISOString(), i: 'not-a-uuid' }),
      ).toString('base64url');

      const res = await http().get(`/feed?cursor=${invalidPayload}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_CURSOR');
    });

    it('returns 400 VALIDATION_ERROR when limit exceeds max of 50', async () => {
      const res = await http().get('/feed?limit=51');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR when limit is <= 0 or not an integer', async () => {
      const rZero = await http().get('/feed?limit=0');
      expect(rZero.status).toBe(400);
      expect(rZero.body.code).toBe('VALIDATION_ERROR');

      const rNegative = await http().get('/feed?limit=-5');
      expect(rNegative.status).toBe(400);
      expect(rNegative.body.code).toBe('VALIDATION_ERROR');

      const rString = await http().get('/feed?limit=abc');
      expect(rString.status).toBe(400);
      expect(rString.body.code).toBe('VALIDATION_ERROR');
    });
  });
});
