import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPost,
  createTestingApp,
  createUser,
  getPrisma,
  makeToken,
  putFakeImage,
  putFakeVideo,
  resetDb,
} from '../../../../test/test-utils';

const bearer = (claims: Parameters<typeof makeToken>[0]) => `Bearer ${makeToken(claims)}`;

describe('Phase 3: Posts CRUD & Soft Delete (E2E)', () => {
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

  describe('POST /posts', () => {
    it('creates an active post with text only', async () => {
      const auth = bearer({ uid: 'author-1' });

      const res = await http()
        .post('/posts')
        .set('Authorization', auth)
        .send({ text: 'Hello Ummah!' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.text).toBe('Hello Ummah!');
      expect(res.body.media).toEqual([]);
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.author.id).toBeDefined();
      expect(res.body.author.displayName).toBeDefined();
      expect(res.body.createdAt).toBeDefined();

      // Invariant: no sensitive fields leaked
      expect(res.body.reportCount).toBeUndefined();
      expect(res.body.updatedAt).toBeUndefined();
      expect(res.body.authorId).toBeUndefined();
    });

    it('creates an active post with 4 images in ordered positions', async () => {
      const auth = bearer({ uid: 'author-imgs' });
      const meRes = await http().get('/auth/me').set('Authorization', auth);
      const userId = meRes.body.id;

      const k1 = putFakeImage(app, userId);
      const k2 = putFakeImage(app, userId);
      const k3 = putFakeImage(app, userId);
      const k4 = putFakeImage(app, userId);

      const res = await http()
        .post('/posts')
        .set('Authorization', auth)
        .send({
          text: 'Four Photos',
          mediaKeys: [k1, k2, k3, k4],
        });

      expect(res.status).toBe(201);
      expect(res.body.media).toHaveLength(4);
      expect(res.body.media[0]).toEqual({
        url: `${process.env.MEDIA_PUBLIC_BASE_URL}/${k1}`,
        type: 'IMAGE',
        position: 0,
      });
      expect(res.body.media[3]).toEqual({
        url: `${process.env.MEDIA_PUBLIC_BASE_URL}/${k4}`,
        type: 'IMAGE',
        position: 3,
      });
    });

    it('creates an active post with a single video', async () => {
      const auth = bearer({ uid: 'author-video' });
      const meRes = await http().get('/auth/me').set('Authorization', auth);
      const userId = meRes.body.id;

      const videoKey = putFakeVideo(app, userId);

      const res = await http()
        .post('/posts')
        .set('Authorization', auth)
        .send({
          mediaKeys: [videoKey],
        });

      expect(res.status).toBe(201);
      expect(res.body.text).toBeNull();
      expect(res.body.media).toHaveLength(1);
      expect(res.body.media[0].type).toBe('VIDEO');
      expect(res.body.media[0].url).toBe(`${process.env.MEDIA_PUBLIC_BASE_URL}/${videoKey}`);
    });

    it('sanitizes control characters and trims text', async () => {
      const auth = bearer({ uid: 'author-sanitize' });

      const res = await http()
        .post('/posts')
        .set('Authorization', auth)
        .send({ text: '  Hello \u0000World! \u0007 ' });

      expect(res.status).toBe(201);
      expect(res.body.text).toBe('Hello World!');
    });

    it('rejects post without text and without media with 400 EMPTY_POST', async () => {
      const auth = bearer({ uid: 'author-empty' });

      const res = await http()
        .post('/posts')
        .set('Authorization', auth)
        .send({ text: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('EMPTY_POST');
    });

    it('rejects post with text exceeding 2000 characters with 400 VALIDATION_ERROR', async () => {
      const auth = bearer({ uid: 'author-long' });

      const res = await http()
        .post('/posts')
        .set('Authorization', auth)
        .send({ text: 'a'.repeat(2001) });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects post with 5 media keys with 400 VALIDATION_ERROR', async () => {
      const auth = bearer({ uid: 'author-5keys' });
      const meRes = await http().get('/auth/me').set('Authorization', auth);
      const userId = meRes.body.id;

      const keys = Array.from({ length: 5 }, () => putFakeImage(app, userId));

      const res = await http()
        .post('/posts')
        .set('Authorization', auth)
        .send({ mediaKeys: keys });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects post with duplicate media keys with 400 VALIDATION_ERROR', async () => {
      const auth = bearer({ uid: 'author-dup' });
      const meRes = await http().get('/auth/me').set('Authorization', auth);
      const userId = meRes.body.id;

      const key = putFakeImage(app, userId);

      const res = await http()
        .post('/posts')
        .set('Authorization', auth)
        .send({ mediaKeys: [key, key] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid key format with 400 VALIDATION_ERROR', async () => {
      const auth = bearer({ uid: 'author-badkey' });

      const res = await http()
        .post('/posts')
        .set('Authorization', auth)
        .send({ mediaKeys: ['media/invalid/key.jpg'] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects key belonging to another user with 403 MEDIA_NOT_OWNED', async () => {
      const auth = bearer({ uid: 'author-theft' });
      const victimKey = `media/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.jpg`;

      const res = await http()
        .post('/posts')
        .set('Authorization', auth)
        .send({ mediaKeys: [victimKey] });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MEDIA_NOT_OWNED');
    });

    it('rejects key not uploaded to storage with 400 MEDIA_NOT_FOUND', async () => {
      const auth = bearer({ uid: 'author-notfound' });
      const meRes = await http().get('/auth/me').set('Authorization', auth);
      const userId = meRes.body.id;

      const nonExistentKey = `media/${userId}/00000000-0000-0000-0000-000000000003.jpg`;

      const res = await http()
        .post('/posts')
        .set('Authorization', auth)
        .send({ mediaKeys: [nonExistentKey] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MEDIA_NOT_FOUND');
    });

    it('rejects combination of image and video with 400 INVALID_MEDIA_COMBINATION', async () => {
      const auth = bearer({ uid: 'author-combo' });
      const meRes = await http().get('/auth/me').set('Authorization', auth);
      const userId = meRes.body.id;

      const img = putFakeImage(app, userId);
      const vid = putFakeVideo(app, userId);

      const res = await http()
        .post('/posts')
        .set('Authorization', auth)
        .send({ mediaKeys: [img, vid] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_MEDIA_COMBINATION');
    });

    it('rejects media key that is already used with 409 MEDIA_ALREADY_USED', async () => {
      const auth = bearer({ uid: 'author-reuse' });
      const meRes = await http().get('/auth/me').set('Authorization', auth);
      const userId = meRes.body.id;

      const img = putFakeImage(app, userId);

      const res1 = await http()
        .post('/posts')
        .set('Authorization', auth)
        .send({ mediaKeys: [img] });
      expect(res1.status).toBe(201);

      const res2 = await http()
        .post('/posts')
        .set('Authorization', auth)
        .send({ mediaKeys: [img] });

      expect(res2.status).toBe(409);
      expect(res2.body.code).toBe('MEDIA_ALREADY_USED');
    });

    it('handles race on concurrent POST with the same media key', async () => {
      const auth = bearer({ uid: 'author-race' });
      const meRes = await http().get('/auth/me').set('Authorization', auth);
      const userId = meRes.body.id;

      const key = putFakeImage(app, userId);

      const [r1, r2] = await Promise.all([
        http().post('/posts').set('Authorization', auth).send({ mediaKeys: [key] }),
        http().post('/posts').set('Authorization', auth).send({ mediaKeys: [key] }),
      ]);

      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);
    });

    it('rejects extra unknown properties with 400 VALIDATION_ERROR', async () => {
      const auth = bearer({ uid: 'author-extra' });

      const res = await http()
        .post('/posts')
        .set('Authorization', auth)
        .send({ text: 'Valid', unknownProp: 'hack' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unauthenticated request with 401 UNAUTHENTICATED', async () => {
      const res = await http().post('/posts').send({ text: 'Anonymous' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('rejects suspended user with 403 ACCOUNT_SUSPENDED', async () => {
      const suspendedUser = await createUser(app, { status: 'SUSPENDED' });
      const auth = bearer({ uid: suspendedUser.firebaseUid });

      const res = await http().post('/posts').set('Authorization', auth).send({ text: 'Trying' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
    });
  });

  describe('GET /posts/:id', () => {
    it('returns active post to public unauthenticated request', async () => {
      const author = await createUser(app);
      const post = await createPost(app, { authorId: author.id, text: 'Public Post' });

      const res = await http().get(`/posts/${post.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(post.id);
      expect(res.body.text).toBe('Public Post');
      expect(res.body.author.id).toBe(author.id);
    });

    it('ignores invalid bearer token on public route and returns 200', async () => {
      const author = await createUser(app);
      const post = await createPost(app, { authorId: author.id, text: 'Public Token Ignored' });

      const res = await http()
        .get(`/posts/${post.id}`)
        .set('Authorization', 'Bearer invalid_or_expired_garbage');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(post.id);
    });

    it('returns 404 POST_NOT_FOUND when post is HIDDEN (even for author)', async () => {
      const author = await createUser(app);
      const post = await createPost(app, { authorId: author.id, status: 'HIDDEN' });

      const res = await http().get(`/posts/${post.id}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');
    });

    it('returns 404 POST_NOT_FOUND when post is DELETED', async () => {
      const author = await createUser(app);
      const post = await createPost(app, { authorId: author.id, status: 'DELETED' });

      const res = await http().get(`/posts/${post.id}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');
    });

    it('returns 404 POST_NOT_FOUND when post author is SUSPENDED', async () => {
      const author = await createUser(app, { status: 'SUSPENDED' });
      const post = await createPost(app, { authorId: author.id, status: 'ACTIVE' });

      const res = await http().get(`/posts/${post.id}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');
    });

    it('returns 400 VALIDATION_ERROR for non-UUID param', async () => {
      const res = await http().get('/posts/not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /posts/:id', () => {
    it('updates text successfully by owner', async () => {
      const auth = bearer({ uid: 'author-edit' });
      const createRes = await http().post('/posts').set('Authorization', auth).send({ text: 'Initial' });
      const postId = createRes.body.id;

      const res = await http()
        .patch(`/posts/${postId}`)
        .set('Authorization', auth)
        .send({ text: 'Updated Text' });

      expect(res.status).toBe(200);
      expect(res.body.text).toBe('Updated Text');
    });

    it('allows setting text to null when post has media', async () => {
      const auth = bearer({ uid: 'author-cleartxt' });
      const meRes = await http().get('/auth/me').set('Authorization', auth);
      const img = putFakeImage(app, meRes.body.id);

      const createRes = await http()
        .post('/posts')
        .set('Authorization', auth)
        .send({ text: 'Initial with Image', mediaKeys: [img] });
      const postId = createRes.body.id;

      const res = await http()
        .patch(`/posts/${postId}`)
        .set('Authorization', auth)
        .send({ text: null });

      expect(res.status).toBe(200);
      expect(res.body.text).toBeNull();
      expect(res.body.media).toHaveLength(1);
    });

    it('rejects setting text to null on text-only post with 400 EMPTY_POST', async () => {
      const auth = bearer({ uid: 'author-emptyedit' });
      const createRes = await http().post('/posts').set('Authorization', auth).send({ text: 'Only Text' });
      const postId = createRes.body.id;

      const res = await http()
        .patch(`/posts/${postId}`)
        .set('Authorization', auth)
        .send({ text: null });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('EMPTY_POST');
    });

    it('rejects attempt to edit post by stranger with 403 NOT_POST_OWNER', async () => {
      const authorAuth = bearer({ uid: 'real-author' });
      const strangerAuth = bearer({ uid: 'intruder' });

      const createRes = await http().post('/posts').set('Authorization', authorAuth).send({ text: 'Private' });
      const postId = createRes.body.id;

      const res = await http()
        .patch(`/posts/${postId}`)
        .set('Authorization', strangerAuth)
        .send({ text: 'Hacked' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_POST_OWNER');
    });

    it('rejects attempt to edit HIDDEN post by owner with 409 POST_NOT_EDITABLE', async () => {
      const authorAuth = bearer({ uid: 'author-hidden' });
      const meRes = await http().get('/auth/me').set('Authorization', authorAuth);
      const post = await createPost(app, { authorId: meRes.body.id, status: 'HIDDEN' });

      const res = await http()
        .patch(`/posts/${post.id}`)
        .set('Authorization', authorAuth)
        .send({ text: 'Trying to edit hidden' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('POST_NOT_EDITABLE');
    });

    it('returns 404 POST_NOT_FOUND when stranger attempts to edit HIDDEN post', async () => {
      const author = await createUser(app);
      const strangerAuth = bearer({ uid: 'stranger-hidden' });
      const post = await createPost(app, { authorId: author.id, status: 'HIDDEN' });

      const res = await http()
        .patch(`/posts/${post.id}`)
        .set('Authorization', strangerAuth)
        .send({ text: 'Trying to edit' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');
    });

    it('returns 404 POST_NOT_FOUND when attempting to edit DELETED post', async () => {
      const authorAuth = bearer({ uid: 'author-deleted' });
      const meRes = await http().get('/auth/me').set('Authorization', authorAuth);
      const post = await createPost(app, { authorId: meRes.body.id, status: 'DELETED' });

      const res = await http()
        .patch(`/posts/${post.id}`)
        .set('Authorization', authorAuth)
        .send({ text: 'Edit deleted' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');
    });

    it('rejects attempt to edit media via PATCH /posts/:id with 400 VALIDATION_ERROR', async () => {
      const authorAuth = bearer({ uid: 'author-mediapatch' });
      const createRes = await http().post('/posts').set('Authorization', authorAuth).send({ text: 'Post' });
      const postId = createRes.body.id;

      const res = await http()
        .patch(`/posts/${postId}`)
        .set('Authorization', authorAuth)
        .send({ text: 'Valid', mediaKeys: [] });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /posts/:id', () => {
    it('performs soft delete by owner and returns 204', async () => {
      const authorAuth = bearer({ uid: 'author-del' });
      const meRes = await http().get('/auth/me').set('Authorization', authorAuth);
      const img = putFakeImage(app, meRes.body.id);

      const createRes = await http()
        .post('/posts')
        .set('Authorization', authorAuth)
        .send({ text: 'Will be deleted', mediaKeys: [img] });
      const postId = createRes.body.id;

      const res = await http().delete(`/posts/${postId}`).set('Authorization', authorAuth);
      expect(res.status).toBe(204);

      // Verify DB row still exists with status DELETED and post_media remains intact
      const dbPost = await getPrisma(app).post.findUnique({
        where: { id: postId },
        include: { media: true },
      });
      expect(dbPost).not.toBeNull();
      expect(dbPost?.status).toBe('DELETED');
      expect(dbPost?.media).toHaveLength(1);

      // Subsequent public GET is 404
      const getRes = await http().get(`/posts/${postId}`);
      expect(getRes.status).toBe(404);
    });

    it('allows owner to DELETE a HIDDEN post', async () => {
      const authorAuth = bearer({ uid: 'author-delhidden' });
      const meRes = await http().get('/auth/me').set('Authorization', authorAuth);
      const post = await createPost(app, { authorId: meRes.body.id, status: 'HIDDEN' });

      const res = await http().delete(`/posts/${post.id}`).set('Authorization', authorAuth);
      expect(res.status).toBe(204);

      const dbPost = await getPrisma(app).post.findUnique({ where: { id: post.id } });
      expect(dbPost?.status).toBe('DELETED');
    });

    it('rejects DELETE by stranger with 403 NOT_POST_OWNER', async () => {
      const author = await createUser(app);
      const strangerAuth = bearer({ uid: 'stranger-del' });
      const post = await createPost(app, { authorId: author.id, status: 'ACTIVE' });

      const res = await http().delete(`/posts/${post.id}`).set('Authorization', strangerAuth);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_POST_OWNER');
    });

    it('returns 404 POST_NOT_FOUND when stranger attempts to DELETE a HIDDEN post', async () => {
      const author = await createUser(app);
      const strangerAuth = bearer({ uid: 'stranger-delhidden' });
      const post = await createPost(app, { authorId: author.id, status: 'HIDDEN' });

      const res = await http().delete(`/posts/${post.id}`).set('Authorization', strangerAuth);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');
    });

    it('returns 404 POST_NOT_FOUND when attempting to DELETE an already DELETED post', async () => {
      const authorAuth = bearer({ uid: 'author-del2' });
      const meRes = await http().get('/auth/me').set('Authorization', authorAuth);
      const post = await createPost(app, { authorId: meRes.body.id, status: 'DELETED' });

      const res = await http().delete(`/posts/${post.id}`).set('Authorization', authorAuth);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('POST_NOT_FOUND');
    });
  });
});
