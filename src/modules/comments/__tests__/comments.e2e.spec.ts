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
import { v4 as uuidv4 } from 'uuid';

const bearer = (claims: Parameters<typeof makeToken>[0]) => `Bearer ${makeToken(claims)}`;

describe('Phase 2: Comments Module & Post Integration (E2E)', () => {
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

  describe('POST /posts/:postId/comments', () => {
    it('[Positive] creates a comment on an active post and increments commentsCount', async () => {
      const postAuthor = await createUser(app, { displayName: 'Post Author' });
      const commentAuthor = await createUser(app, { displayName: 'Commenter' });
      const post = await createPost(app, { authorId: postAuthor.id, text: 'Public post for comments' });

      const auth = bearer({ uid: commentAuthor.firebaseUid });

      const res = await http()
        .post(`/posts/${post.id}/comments`)
        .set('Authorization', auth)
        .send({ text: 'هذا تعليق رائع ومفيد جداً!' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.postId).toBe(post.id);
      expect(res.body.text).toBe('هذا تعليق رائع ومفيد جداً!');
      expect(res.body.author.id).toBe(commentAuthor.id);
      expect(res.body.author.displayName).toBe('Commenter');
      expect(res.body.createdAt).toBeDefined();

      // Invariant: verify post's commentsCount was atomically incremented in DB
      const updatedPost = await getPrisma(app).post.findUnique({
        where: { id: post.id },
      });
      expect(updatedPost?.commentsCount).toBe(1);
    });

    it('[Negative] returns 404 when attempting to comment on a non-existent post', async () => {
      const user = await createUser(app);
      const auth = bearer({ uid: user.firebaseUid });
      const ghostPostId = uuidv4();

      const res = await http()
        .post(`/posts/${ghostPostId}/comments`)
        .set('Authorization', auth)
        .send({ text: 'Ghost comment' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        statusCode: 404,
        code: 'POST_NOT_FOUND',
        message: 'Post not found or unavailable',
      });
    });

    it('[Negative] returns 404 when commenting on a DELETED post', async () => {
      const author = await createUser(app);
      const commenter = await createUser(app);
      const post = await createPost(app, { authorId: author.id, status: 'DELETED' });

      const auth = bearer({ uid: commenter.firebaseUid });

      const res = await http()
        .post(`/posts/${post.id}/comments`)
        .set('Authorization', auth)
        .send({ text: 'Comment on deleted post' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');
    });

    it('[Negative] returns 403 when a SUSPENDED user attempts to comment', async () => {
      const author = await createUser(app);
      const suspendedUser = await createUser(app, { status: 'SUSPENDED' });
      const post = await createPost(app, { authorId: author.id });

      const auth = bearer({ uid: suspendedUser.firebaseUid });

      const res = await http()
        .post(`/posts/${post.id}/comments`)
        .set('Authorization', auth)
        .send({ text: 'Spam from suspended user' });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        statusCode: 403,
        code: 'ACCOUNT_SUSPENDED',
        message: 'Account is suspended',
      });
    });

    it('[Negative] rejects empty comment or whitespace-only comment with 400', async () => {
      const author = await createUser(app);
      const commenter = await createUser(app);
      const post = await createPost(app, { authorId: author.id });
      const auth = bearer({ uid: commenter.firebaseUid });

      const resEmpty = await http()
        .post(`/posts/${post.id}/comments`)
        .set('Authorization', auth)
        .send({ text: '' });

      expect(resEmpty.status).toBe(400);
      expect(resEmpty.body.code).toBe('VALIDATION_ERROR');

      const resWhitespace = await http()
        .post(`/posts/${post.id}/comments`)
        .set('Authorization', auth)
        .send({ text: '     ' });

      expect(resWhitespace.status).toBe(400);
      expect(resWhitespace.body.code).toBe('VALIDATION_ERROR');
    });

    it('[Negative] rejects comments exceeding 1000 characters with 400', async () => {
      const author = await createUser(app);
      const commenter = await createUser(app);
      const post = await createPost(app, { authorId: author.id });
      const auth = bearer({ uid: commenter.firebaseUid });

      const tooLong = 'a'.repeat(1001);

      const res = await http()
        .post(`/posts/${post.id}/comments`)
        .set('Authorization', auth)
        .send({ text: tooLong });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('[Positive Sanitization] strips non-printable control characters from comment text', async () => {
      const author = await createUser(app);
      const commenter = await createUser(app);
      const post = await createPost(app, { authorId: author.id });
      const auth = bearer({ uid: commenter.firebaseUid });

      const tainted = 'Hello\u0000World\u0007!';

      const res = await http()
        .post(`/posts/${post.id}/comments`)
        .set('Authorization', auth)
        .send({ text: tainted });

      expect(res.status).toBe(201);
      expect(res.body.text).toBe('HelloWorld!');
    });
  });

  describe('GET /posts/:postId/comments', () => {
    it('[Positive] paginates comments using cursor-based pagination', async () => {
      const author = await createUser(app);
      const commenter = await createUser(app);
      const post = await createPost(app, { authorId: author.id });

      // Create 3 comments sequentially
      const c1 = await getPrisma(app).comment.create({
        data: {
          postId: post.id,
          authorId: commenter.id,
          text: 'Comment 1',
          createdAt: new Date('2026-10-25T10:00:00.000Z'),
        },
      });

      const c2 = await getPrisma(app).comment.create({
        data: {
          postId: post.id,
          authorId: commenter.id,
          text: 'Comment 2',
          createdAt: new Date('2026-10-25T11:00:00.000Z'),
        },
      });

      const c3 = await getPrisma(app).comment.create({
        data: {
          postId: post.id,
          authorId: commenter.id,
          text: 'Comment 3',
          createdAt: new Date('2026-10-25T12:00:00.000Z'),
        },
      });

      // Page 1: limit = 2 (newest first: c3, c2)
      const resPage1 = await http()
        .get(`/posts/${post.id}/comments?limit=2`);

      expect(resPage1.status).toBe(200);
      expect(resPage1.body.items).toHaveLength(2);
      expect(resPage1.body.items[0].id).toBe(c3.id);
      expect(resPage1.body.items[1].id).toBe(c2.id);
      expect(resPage1.body.hasMore).toBe(true);
      expect(resPage1.body.nextCursor).toBeDefined();

      // Page 2: with cursor
      const resPage2 = await http()
        .get(`/posts/${post.id}/comments?limit=2&cursor=${resPage1.body.nextCursor}`);

      expect(resPage2.status).toBe(200);
      expect(resPage2.body.items).toHaveLength(1);
      expect(resPage2.body.items[0].id).toBe(c1.id);
      expect(resPage2.body.hasMore).toBe(false);
      expect(resPage2.body.nextCursor).toBeNull();
    });

    it('[Negative] returns 400 when cursor is invalid or tampered', async () => {
      const author = await createUser(app);
      const post = await createPost(app, { authorId: author.id });

      const res = await http().get(`/posts/${post.id}/comments?cursor=bad-garbage-cursor`);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        statusCode: 400,
        code: 'INVALID_CURSOR',
        message: 'Invalid cursor',
      });
    });

    it('[Negative] returns 404 when querying comments of a non-existent post', async () => {
      const res = await http().get(`/posts/${uuidv4()}/comments`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');
    });
  });

  describe('DELETE /posts/:postId/comments/:commentId', () => {
    it('[Positive] comment author can delete their own comment and commentsCount decrements', async () => {
      const author = await createUser(app);
      const commenter = await createUser(app);
      const post = await createPost(app, { authorId: author.id });

      // Create comment and update count
      const comment = await getPrisma(app).comment.create({
        data: { postId: post.id, authorId: commenter.id, text: 'My comment' },
      });
      await getPrisma(app).post.update({
        where: { id: post.id },
        data: { commentsCount: 1 },
      });

      const auth = bearer({ uid: commenter.firebaseUid });

      const res = await http()
        .delete(`/posts/${post.id}/comments/${comment.id}`)
        .set('Authorization', auth);

      expect(res.status).toBe(204);

      // Verify soft delete & commentsCount decrement
      const dbComment = await getPrisma(app).comment.findUnique({ where: { id: comment.id } });
      expect(dbComment?.status).toBe('DELETED');

      const dbPost = await getPrisma(app).post.findUnique({ where: { id: post.id } });
      expect(dbPost?.commentsCount).toBe(0);

      // Verify it no longer appears in GET
      const getRes = await http().get(`/posts/${post.id}/comments`);
      expect(getRes.body.items).toHaveLength(0);
    });

    it('[Positive Moderation] post author can delete any comment on their own post', async () => {
      const postAuthor = await createUser(app);
      const troll = await createUser(app);
      const post = await createPost(app, { authorId: postAuthor.id });

      const comment = await getPrisma(app).comment.create({
        data: { postId: post.id, authorId: troll.id, text: 'Rude comment' },
      });
      await getPrisma(app).post.update({
        where: { id: post.id },
        data: { commentsCount: 1 },
      });

      // Post author deletes it
      const auth = bearer({ uid: postAuthor.firebaseUid });

      const res = await http()
        .delete(`/posts/${post.id}/comments/${comment.id}`)
        .set('Authorization', auth);

      expect(res.status).toBe(204);

      const dbComment = await getPrisma(app).comment.findUnique({ where: { id: comment.id } });
      expect(dbComment?.status).toBe('DELETED');
    });

    it('[Negative] unauthorized third user cannot delete another person comment', async () => {
      const postAuthor = await createUser(app);
      const commenter = await createUser(app);
      const thirdUser = await createUser(app);
      const post = await createPost(app, { authorId: postAuthor.id });

      const comment = await getPrisma(app).comment.create({
        data: { postId: post.id, authorId: commenter.id, text: 'Legit comment' },
      });

      const auth = bearer({ uid: thirdUser.firebaseUid });

      const res = await http()
        .delete(`/posts/${post.id}/comments/${comment.id}`)
        .set('Authorization', auth);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'You do not have permission to delete this comment',
      });
    });

    it('[Negative] returns 404 when attempting to delete an already deleted comment', async () => {
      const author = await createUser(app);
      const post = await createPost(app, { authorId: author.id });

      const comment = await getPrisma(app).comment.create({
        data: { postId: post.id, authorId: author.id, text: 'Already gone', status: 'DELETED' },
      });

      const auth = bearer({ uid: author.firebaseUid });

      const res = await http()
        .delete(`/posts/${post.id}/comments/${comment.id}`)
        .set('Authorization', auth);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('COMMENT_NOT_FOUND');
    });

    it('[Negative] returns 404 when comment does not belong to the given postId', async () => {
      const author = await createUser(app);
      const post1 = await createPost(app, { authorId: author.id });
      const post2 = await createPost(app, { authorId: author.id });

      const comment = await getPrisma(app).comment.create({
        data: { postId: post1.id, authorId: author.id, text: 'Comment on post 1' },
      });

      const auth = bearer({ uid: author.firebaseUid });

      // Delete with wrong postId (post2 instead of post1)
      const res = await http()
        .delete(`/posts/${post2.id}/comments/${comment.id}`)
        .set('Authorization', auth);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('COMMENT_NOT_FOUND');
    });
  });
});
