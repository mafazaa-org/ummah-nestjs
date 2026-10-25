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

describe('Phase 6: Ops Runbook & Manual Database Procedures (E2E)', () => {
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

  describe('Procedure 2.1: Reinstate a Hidden Post (HIDDEN -> ACTIVE)', () => {
    it('atomically reinstates a post, resets its counter, compensates author reportCount, and preserves report rows', async () => {
      const author = await createUser(app, { displayName: 'Reinstated Author' });
      const post = await createPost(app, {
        authorId: author.id,
        text: 'Post to be hidden and reinstated',
      });

      // Submit 7 reports to trigger automatic hiding (Threshold = 7)
      for (let i = 1; i <= 7; i++) {
        const res = await http()
          .post(`/posts/${post.id}/report`)
          .set('Authorization', bearer({ uid: `reporter-runbook-${i}` }))
          .send({ reason: 'SPAM' });
        expect(res.status).toBe(201);
      }

      const prisma = getPrisma(app);

      // Verify post is HIDDEN and author has 7 reports
      let postInDb = await prisma.post.findUnique({ where: { id: post.id } });
      expect(postInDb?.status).toBe('HIDDEN');
      expect(postInDb?.reportCount).toBe(7);

      let authorInDb = await prisma.user.findUnique({ where: { id: author.id } });
      expect(authorInDb?.reportCount).toBe(7);

      // Verify post is hidden from public API
      const feedBefore = await http().get('/feed');
      const inFeedBefore = feedBefore.body.items.some((item: any) => item.id === post.id);
      expect(inFeedBefore).toBe(false);

      const singleBefore = await http().get(`/posts/${post.id}`);
      expect(singleBefore.status).toBe(404);

      // Execute Runbook Procedure 2.1 SQL query exactly as documented
      const reinstated = await prisma.$queryRawUnsafe<any[]>(`
        WITH p AS (
          SELECT id, "authorId", "reportCount" 
          FROM posts
          WHERE id = '${post.id}' AND status = 'HIDDEN' 
          FOR UPDATE
        ), u AS (
          UPDATE users 
          SET "reportCount" = GREATEST(0, users."reportCount" - p."reportCount"), 
              "updatedAt" = now()
          FROM p 
          WHERE users.id = p."authorId"
          RETURNING users.id
        )
        UPDATE posts 
        SET status = 'ACTIVE', 
            "reportCount" = 0, 
            "updatedAt" = now()
        WHERE id IN (SELECT id FROM p)
        RETURNING id, status, "reportCount";
      `);

      expect(reinstated).toHaveLength(1);
      expect(reinstated[0].status).toBe('ACTIVE');
      expect(reinstated[0].reportCount).toBe(0);

      // Verify author's report count was compensated (7 - 7 = 0)
      authorInDb = await prisma.user.findUnique({ where: { id: author.id } });
      expect(authorInDb?.reportCount).toBe(0);

      // Verify post is immediately visible in feed and single post endpoint
      const feedAfter = await http().get('/feed');
      expect(feedAfter.status).toBe(200);
      const inFeedAfter = feedAfter.body.items.some((item: any) => item.id === post.id);
      expect(inFeedAfter).toBe(true);

      const singleAfter = await http().get(`/posts/${post.id}`);
      expect(singleAfter.status).toBe(200);
      expect(singleAfter.body.id).toBe(post.id);
      expect(singleAfter.body.status).toBe('ACTIVE');

      // Verify duplicate report immunity: previous reporter cannot report again
      const dupRes = await http()
        .post(`/posts/${post.id}/report`)
        .set('Authorization', bearer({ uid: 'reporter-runbook-1' }))
        .send({ reason: 'SPAM' });
      expect(dupRes.status).toBe(409);
      expect(dupRes.body.code).toBe('ALREADY_REPORTED');

      // Verify fresh report from a new reporter is accepted and increments from 0
      const freshRes = await http()
        .post(`/posts/${post.id}/report`)
        .set('Authorization', bearer({ uid: 'reporter-runbook-fresh' }))
        .send({ reason: 'OTHER' });
      expect(freshRes.status).toBe(201);

      postInDb = await prisma.post.findUnique({ where: { id: post.id } });
      expect(postInDb?.reportCount).toBe(1);

      authorInDb = await prisma.user.findUnique({ where: { id: author.id } });
      expect(authorInDb?.reportCount).toBe(1);
    });
  });

  describe('Procedure 2.2: Un-suspend a User (SUSPENDED -> ACTIVE)', () => {
    it('restores a suspended user to ACTIVE, resets report count to 0, and restores API access', async () => {
      const user = await createUser(app, {
        firebaseUid: 'suspended-admin-target',
        status: 'SUSPENDED',
        reportCount: 15,
      });

      // Verify suspended user is blocked from making authenticated requests
      const userToken = bearer({ uid: 'suspended-admin-target' });
      const meBefore = await http().get('/auth/me').set('Authorization', userToken);
      expect(meBefore.status).toBe(403);
      expect(meBefore.body.code).toBe('ACCOUNT_SUSPENDED');

      // Execute Runbook Procedure 2.2 SQL query
      const prisma = getPrisma(app);
      const unsuspended = await prisma.$queryRawUnsafe<any[]>(`
        UPDATE users 
        SET status = 'ACTIVE', 
            "reportCount" = 0, 
            "updatedAt" = now()
        WHERE id = '${user.id}' AND status = 'SUSPENDED'
        RETURNING id, "displayName", status, "reportCount";
      `);

      expect(unsuspended).toHaveLength(1);
      expect(unsuspended[0].status).toBe('ACTIVE');
      expect(unsuspended[0].reportCount).toBe(0);

      // Verify user is immediately able to use the API
      const meAfter = await http().get('/auth/me').set('Authorization', userToken);
      expect(meAfter.status).toBe(200);
      expect(meAfter.body.id).toBe(user.id);
      expect(meAfter.body.status).toBe('ACTIVE');

      // Verify public profile is now accessible
      const profileRes = await http().get(`/users/${user.id}`);
      expect(profileRes.status).toBe(200);
      expect(profileRes.body.id).toBe(user.id);
    });
  });
});
