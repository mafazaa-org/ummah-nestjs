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

describe('Phase 5: Reports & Moderation (E2E)', () => {
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

  describe('Happy Path & D4 Zero Counter Leak', () => {
    it('successfully reports an active post and returns report data without leaking counters', async () => {
      const author = await createUser(app, { displayName: 'Author One' });
      const post = await createPost(app, { authorId: author.id, text: 'Reportable post' });
      const reporterToken = bearer({ uid: 'reporter-1' });

      const res = await http()
        .post(`/posts/${post.id}/report`)
        .set('Authorization', reporterToken)
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.postId).toBe(post.id);
      expect(res.body.reason).toBe('SPAM');
      expect(res.body.createdAt).toBeDefined();

      // D4: Zero counter leak check
      expect(res.body.reportCount).toBeUndefined();
      expect(res.body.updatedAt).toBeUndefined();
      expect(res.body.authorId).toBeUndefined();

      // Database verification
      const prisma = getPrisma(app);
      const dbReport = await prisma.report.findUnique({
        where: { id: res.body.id },
      });
      expect(dbReport).not.toBeNull();
      expect(dbReport?.postId).toBe(post.id);
      expect(dbReport?.reason).toBe('SPAM');

      const updatedPost = await prisma.post.findUnique({ where: { id: post.id } });
      expect(updatedPost?.reportCount).toBe(1);

      const updatedAuthor = await prisma.user.findUnique({ where: { id: author.id } });
      expect(updatedAuthor?.reportCount).toBe(1);
    });

    it('accepts all valid ReportReason enum values', async () => {
      const author = await createUser(app);
      const post = await createPost(app, { authorId: author.id });

      const reasons = ['RELIGIOUS_VIOLATION', 'VIOLENCE', 'SPAM', 'OTHER'] as const;
      for (let i = 0; i < reasons.length; i++) {
        const p = await createPost(app, { authorId: author.id });
        const res = await http()
          .post(`/posts/${p.id}/report`)
          .set('Authorization', bearer({ uid: `reporter-enum-${i}` }))
          .send({ reason: reasons[i] });

        expect(res.status).toBe(201);
        expect(res.body.reason).toBe(reasons[i]);
      }
    });
  });

  describe('Validation & Input Constraints', () => {
    it('returns 400 VALIDATION_ERROR on invalid reason', async () => {
      const author = await createUser(app);
      const post = await createPost(app, { authorId: author.id });

      const res = await http()
        .post(`/posts/${post.id}/report`)
        .set('Authorization', bearer({ uid: 'reporter-v1' }))
        .send({ reason: 'INVALID_REASON' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR on missing reason', async () => {
      const author = await createUser(app);
      const post = await createPost(app, { authorId: author.id });

      const res = await http()
        .post(`/posts/${post.id}/report`)
        .set('Authorization', bearer({ uid: 'reporter-v2' }))
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR on non-UUID postId', async () => {
      const res = await http()
        .post('/posts/not-a-uuid/report')
        .set('Authorization', bearer({ uid: 'reporter-v3' }))
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Auth & Permission Enforcement', () => {
    it('returns 401 AUTH_REQUIRED when unauthenticated', async () => {
      const author = await createUser(app);
      const post = await createPost(app, { authorId: author.id });

      const res = await http()
        .post(`/posts/${post.id}/report`)
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('returns 403 ACCOUNT_SUSPENDED when reporter is suspended', async () => {
      const author = await createUser(app);
      const post = await createPost(app, { authorId: author.id });
      await createUser(app, { firebaseUid: 'suspended-rep', status: 'SUSPENDED' });

      const res = await http()
        .post(`/posts/${post.id}/report`)
        .set('Authorization', bearer({ uid: 'suspended-rep' }))
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('returns 403 CANNOT_REPORT_OWN_POST when author reports their own post', async () => {
      const author = await createUser(app, { firebaseUid: 'self-author' });
      const post = await createPost(app, { authorId: author.id });

      const res = await http()
        .post(`/posts/${post.id}/report`)
        .set('Authorization', bearer({ uid: 'self-author' }))
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CANNOT_REPORT_OWN_POST');
    });
  });

  describe('D5 Duplicate Report Guard (Database Unique Constraint)', () => {
    it('returns 409 ALREADY_REPORTED on duplicate report from same reporter', async () => {
      const author = await createUser(app);
      const post = await createPost(app, { authorId: author.id });
      const reporterToken = bearer({ uid: 'duplicate-rep' });

      // First report -> 201
      const firstRes = await http()
        .post(`/posts/${post.id}/report`)
        .set('Authorization', reporterToken)
        .send({ reason: 'SPAM' });
      expect(firstRes.status).toBe(201);

      // Second report from same user on same post -> 409
      const secondRes = await http()
        .post(`/posts/${post.id}/report`)
        .set('Authorization', reporterToken)
        .send({ reason: 'OTHER' });
      expect(secondRes.status).toBe(409);
      expect(secondRes.body.code).toBe('ALREADY_REPORTED');

      // Verify reportCount did not increment again
      const prisma = getPrisma(app);
      const updatedPost = await prisma.post.findUnique({ where: { id: post.id } });
      expect(updatedPost?.reportCount).toBe(1);

      const updatedAuthor = await prisma.user.findUnique({ where: { id: author.id } });
      expect(updatedAuthor?.reportCount).toBe(1);
    });
  });

  describe('D2 Fast-Fail Status Checks', () => {
    it('returns 404 POST_NOT_FOUND when post does not exist', async () => {
      const res = await http()
        .post('/posts/00000000-0000-0000-0000-000000000000/report')
        .set('Authorization', bearer({ uid: 'rep-404' }))
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');
    });

    it('returns 404 POST_NOT_FOUND when post is already HIDDEN and does not increment counters', async () => {
      const author = await createUser(app);
      const post = await createPost(app, { authorId: author.id, status: 'HIDDEN' });

      const res = await http()
        .post(`/posts/${post.id}/report`)
        .set('Authorization', bearer({ uid: 'rep-hidden' }))
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');

      const prisma = getPrisma(app);
      const authorInDb = await prisma.user.findUnique({ where: { id: author.id } });
      expect(authorInDb?.reportCount).toBe(0);
    });

    it('returns 404 POST_NOT_FOUND when post is DELETED and does not increment counters', async () => {
      const author = await createUser(app);
      const post = await createPost(app, { authorId: author.id, status: 'DELETED' });

      const res = await http()
        .post(`/posts/${post.id}/report`)
        .set('Authorization', bearer({ uid: 'rep-deleted' }))
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');

      const prisma = getPrisma(app);
      const authorInDb = await prisma.user.findUnique({ where: { id: author.id } });
      expect(authorInDb?.reportCount).toBe(0);
    });

    it('returns 404 POST_NOT_FOUND when post author is SUSPENDED and does not increment counters', async () => {
      const author = await createUser(app, { status: 'SUSPENDED' });
      const post = await createPost(app, { authorId: author.id, status: 'ACTIVE' });

      const res = await http()
        .post(`/posts/${post.id}/report`)
        .set('Authorization', bearer({ uid: 'rep-suspended-author' }))
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');

      const prisma = getPrisma(app);
      const authorInDb = await prisma.user.findUnique({ where: { id: author.id } });
      expect(authorInDb?.reportCount).toBe(0);
    });
  });

  describe('D3 & D7 Post Threshold (7 reports) & Status Matrix', () => {
    it('hides post on 7th report and immediately reflects in visibility across endpoints', async () => {
      const author = await createUser(app, { displayName: 'Threshold Author' });
      const post = await createPost(app, { authorId: author.id, text: 'Flagged Content' });

      // First 6 reports
      for (let i = 1; i <= 6; i++) {
        const res = await http()
          .post(`/posts/${post.id}/report`)
          .set('Authorization', bearer({ uid: `threshold-rep-${i}` }))
          .send({ reason: 'SPAM' });
        expect(res.status).toBe(201);
      }

      // Check post still active after 6 reports
      const prisma = getPrisma(app);
      let postInDb = await prisma.post.findUnique({ where: { id: post.id } });
      expect(postInDb?.status).toBe('ACTIVE');
      expect(postInDb?.reportCount).toBe(6);

      // The 7th report (Threshold reached)
      const seventhRes = await http()
        .post(`/posts/${post.id}/report`)
        .set('Authorization', bearer({ uid: 'threshold-rep-7' }))
        .send({ reason: 'VIOLENCE' });

      expect(seventhRes.status).toBe(201);

      postInDb = await prisma.post.findUnique({ where: { id: post.id } });
      expect(postInDb?.status).toBe('HIDDEN');
      expect(postInDb?.reportCount).toBe(7);

      // Status Matrix Invariant checks:
      // 1. GET /feed completely excludes it
      const feedRes = await http().get('/feed');
      expect(feedRes.status).toBe(200);
      const inFeed = feedRes.body.items.some((item: any) => item.id === post.id);
      expect(inFeed).toBe(false);

      // 2. GET /posts/:id returns 404
      const singleRes = await http().get(`/posts/${post.id}`);
      expect(singleRes.status).toBe(404);

      // 3. PATCH /posts/:id by author returns 409 POST_NOT_EDITABLE
      const authorToken = bearer({ uid: author.firebaseUid });
      const patchRes = await http()
        .patch(`/posts/${post.id}`)
        .set('Authorization', authorToken)
        .send({ text: 'Attempt edit' });
      expect(patchRes.status).toBe(409);
      expect(patchRes.body.code).toBe('POST_NOT_EDITABLE');

      // 4. Any subsequent report (8th report) fails fast with 404 POST_NOT_FOUND
      const eighthRes = await http()
        .post(`/posts/${post.id}/report`)
        .set('Authorization', bearer({ uid: 'threshold-rep-8' }))
        .send({ reason: 'SPAM' });
      expect(eighthRes.status).toBe(404);
      expect(eighthRes.body.code).toBe('POST_NOT_FOUND');

      // Author reportCount stopped at 7 and did NOT inflate to 8
      const authorInDb = await prisma.user.findUnique({ where: { id: author.id } });
      expect(authorInDb?.reportCount).toBe(7);
    });
  });

  describe('D3 & D7 User Threshold (15 reports) & Global Suspension', () => {
    it('suspends author when cumulative reports reach 15 across posts', async () => {
      const author = await createUser(app, { displayName: 'Spammer Author' });
      const prisma = getPrisma(app);

      // Create 3 active posts for the author
      const post1 = await createPost(app, { authorId: author.id, text: 'Spam 1' });
      const post2 = await createPost(app, { authorId: author.id, text: 'Spam 2' });
      const post3 = await createPost(app, { authorId: author.id, text: 'Spam 3' });

      let reportCounter = 1;

      // 6 reports on post1
      for (let i = 0; i < 6; i++) {
        await http()
          .post(`/posts/${post1.id}/report`)
          .set('Authorization', bearer({ uid: `user-rep-${reportCounter++}` }))
          .send({ reason: 'SPAM' });
      }

      // 6 reports on post2 (Total 12 reports on author)
      for (let i = 0; i < 6; i++) {
        await http()
          .post(`/posts/${post2.id}/report`)
          .set('Authorization', bearer({ uid: `user-rep-${reportCounter++}` }))
          .send({ reason: 'SPAM' });
      }

      // 2 reports on post3 (Total 14 reports on author)
      for (let i = 0; i < 2; i++) {
        await http()
          .post(`/posts/${post3.id}/report`)
          .set('Authorization', bearer({ uid: `user-rep-${reportCounter++}` }))
          .send({ reason: 'SPAM' });
      }

      let authorInDb = await prisma.user.findUnique({ where: { id: author.id } });
      expect(authorInDb?.status).toBe('ACTIVE');
      expect(authorInDb?.reportCount).toBe(14);

      // 15th cumulative report on post3 (User Threshold reached)
      const finalRes = await http()
        .post(`/posts/${post3.id}/report`)
        .set('Authorization', bearer({ uid: `user-rep-${reportCounter++}` }))
        .send({ reason: 'SPAM' });

      expect(finalRes.status).toBe(201);

      authorInDb = await prisma.user.findUnique({ where: { id: author.id } });
      expect(authorInDb?.status).toBe('SUSPENDED');
      expect(authorInDb?.reportCount).toBe(15);

      // Status Matrix Invariant checks after suspension:
      // 1. Author's requests with their token rejected with 403 ACCOUNT_SUSPENDED
      const authorToken = bearer({ uid: author.firebaseUid });
      const meRes = await http().get('/auth/me').set('Authorization', authorToken);
      expect(meRes.status).toBe(403);
      expect(meRes.body.code).toBe('ACCOUNT_SUSPENDED');

      // 2. Public profile GET /users/:id returns 404
      const profileRes = await http().get(`/users/${author.id}`);
      expect(profileRes.status).toBe(404);

      // 3. Feed excludes all author posts
      const feedRes = await http().get('/feed');
      expect(feedRes.status).toBe(200);
      const anyAuthorPostInFeed = feedRes.body.items.some(
        (item: any) => item.author.id === author.id,
      );
      expect(anyAuthorPostInFeed).toBe(false);
    });
  });

  describe('D1 High Concurrency & Deadlock Safety', () => {
    it('handles concurrent reports on the same post without deadlocks or counter races', async () => {
      const author = await createUser(app);
      const post = await createPost(app, { authorId: author.id, text: 'Concurrent post' });

      const concurrentCount = 5;
      const reporters = Array.from({ length: concurrentCount }, (_, i) => `concurrent-rep-${i}`);

      const results = await Promise.all(
        reporters.map((uid) =>
          http()
            .post(`/posts/${post.id}/report`)
            .set('Authorization', bearer({ uid }))
            .send({ reason: 'SPAM' }),
        ),
      );

      // All 5 must succeed with 201
      for (const res of results) {
        expect(res.status).toBe(201);
      }

      const prisma = getPrisma(app);
      const postInDb = await prisma.post.findUnique({ where: { id: post.id } });
      expect(postInDb?.reportCount).toBe(5);

      const authorInDb = await prisma.user.findUnique({ where: { id: author.id } });
      expect(authorInDb?.reportCount).toBe(5);

      const reportRows = await prisma.report.findMany({ where: { postId: post.id } });
      expect(reportRows).toHaveLength(5);
    });
  });
});
