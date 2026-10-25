import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { createTestingApp, createUser, getPrisma, makeToken, resetDb } from '../../../../test/test-utils';

const bearer = (claims: Parameters<typeof makeToken>[0]) => `Bearer ${makeToken(claims)}`;

describe('Phase 1: Users & Profile (E2E)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  /** Provisions a user via the real flow and returns its id + auth header. */
  async function login(uid = 'fb-me', name = 'Zaid') {
    const auth = bearer({ uid, name });
    const me = await http().get('/auth/me').set('Authorization', auth);
    return { auth, id: me.body.id as string };
  }

  beforeAll(async () => {
    app = await createTestingApp();
  });
  beforeEach(async () => {
    await resetDb(app);
  });
  afterAll(async () => {
    await app.close();
  });

  describe('PATCH /users/me', () => {
    it('U1 updates displayName and bio', async () => {
      const { auth } = await login();
      const res = await http()
        .patch('/users/me')
        .set('Authorization', auth)
        .send({ displayName: 'Zaid Updated', bio: 'My new bio' });
      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('Zaid Updated');
      expect(res.body.bio).toBe('My new bio');
      expect(Object.keys(res.body)).toEqual(['id', 'displayName', 'bio', 'avatarUrl', 'createdAt', 'status']);
    });

    it.each([[null], [''], ['   ']])('U2 bio %j clears the bio (stored as null)', async (bio) => {
      const { auth } = await login();
      await http().patch('/users/me').set('Authorization', auth).send({ bio: 'something' });
      const res = await http().patch('/users/me').set('Authorization', auth).send({ bio });
      expect(res.status).toBe(200);
      expect(res.body.bio).toBeNull();
    });

    it('U3 displayName null -> 400 VALIDATION_ERROR', async () => {
      const { auth } = await login();
      const res = await http().patch('/users/me').set('Authorization', auth).send({ displayName: null });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it.each([[''], ['   '], ['\u0000\u0001']])('U4 displayName %j -> 400', async (displayName) => {
      const { auth } = await login();
      const res = await http().patch('/users/me').set('Authorization', auth).send({ displayName });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('U5 length limits: displayName > 50 and bio > 160 -> 400', async () => {
      const { auth } = await login();
      const a = await http().patch('/users/me').set('Authorization', auth).send({ displayName: 'x'.repeat(51) });
      const b = await http().patch('/users/me').set('Authorization', auth).send({ bio: 'x'.repeat(161) });
      expect(a.status).toBe(400);
      expect(b.status).toBe(400);
      const ok = await http()
        .patch('/users/me')
        .set('Authorization', auth)
        .send({ displayName: 'x'.repeat(50), bio: 'y'.repeat(160) });
      expect(ok.status).toBe(200);
    });

    it('U6 empty body -> 400 EMPTY_UPDATE, but {bio:null} counts as a provided field', async () => {
      const { auth } = await login();
      const empty = await http().patch('/users/me').set('Authorization', auth).send({});
      expect(empty.status).toBe(400);
      expect(empty.body).toEqual({
        statusCode: 400,
        code: 'EMPTY_UPDATE',
        message: 'At least one field must be provided',
      });
      const nullBio = await http().patch('/users/me').set('Authorization', auth).send({ bio: null });
      expect(nullBio.status).toBe(200);
    });

    it.each([['status', 'SUSPENDED'], ['firebaseUid', 'hacked'], ['reportCount', 99], ['id', randomUUID()]])(
      'U7 mass-assignment: unknown field %s is rejected and nothing is written',
      async (field, value) => {
        const { auth, id } = await login();
        const res = await http()
          .patch('/users/me')
          .set('Authorization', auth)
          .send({ displayName: 'Changed', [field]: value });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');

        const row = await getPrisma(app).user.findUniqueOrThrow({ where: { id } });
        expect(row.displayName).toBe('Zaid'); // the whole request was rejected
        expect(row.status).toBe('ACTIVE');
        expect(row.reportCount).toBe(0);
        expect(row.firebaseUid).toBe('fb-me');
      },
    );

    it('U8 strips control characters but keeps newline and tab', async () => {
      const { auth } = await login();
      const res = await http()
        .patch('/users/me')
        .set('Authorization', auth)
        .send({ displayName: 'Za\u0000id', bio: 'line1\nline2\tend\u0007' });
      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('Zaid');
      expect(res.body.bio).toBe('line1\nline2\tend');
    });

    describe('avatarKey verification and storage integration', () => {
      it('U9a malformed key -> 400 VALIDATION_ERROR', async () => {
        const { auth } = await login();
        const res = await http().patch('/users/me').set('Authorization', auth).send({ avatarKey: 'not-a-key' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });

      it("U9b a key under another user's prefix -> 403 MEDIA_NOT_OWNED", async () => {
        const { auth } = await login();
        const other = await createUser(app, { firebaseUid: 'fb-other' });
        const res = await http()
          .patch('/users/me')
          .set('Authorization', auth)
          .send({ avatarKey: `media/${other.id}/${randomUUID()}.jpg` });
        expect(res.status).toBe(403);
        expect(res.body).toEqual({
          statusCode: 403,
          code: 'MEDIA_NOT_OWNED',
          message: 'Media key does not belong to the current user',
        });
      });

      it('U9c own key is accepted and avatarUrl is built without a double slash', async () => {
        const { auth, id } = await login();
        const key = `media/${id}/${randomUUID()}.jpg`;
        const { getFakeS3 } = await import('../../../../test/test-utils');
        getFakeS3(app).putFakeObject(key, { contentType: 'image/jpeg', size: 1000 });

        const res = await http().patch('/users/me').set('Authorization', auth).send({ avatarKey: key });
        expect(res.status).toBe(200);
        expect(res.body.avatarUrl).toBe(`https://media.test.local/${key}`);
        expect(res.body.avatarUrl).not.toMatch(/[^:]\/\//);
      });

      it('U9d avatarKey null removes the avatar', async () => {
        const { auth, id } = await login();
        const key = `media/${id}/${randomUUID()}.jpg`;
        const { getFakeS3 } = await import('../../../../test/test-utils');
        getFakeS3(app).putFakeObject(key, { contentType: 'image/jpeg', size: 1000 });

        await http().patch('/users/me').set('Authorization', auth).send({ avatarKey: key });
        const res = await http().patch('/users/me').set('Authorization', auth).send({ avatarKey: null });
        expect(res.status).toBe(200);
        expect(res.body.avatarUrl).toBeNull();
      });

      it('U9e 400 MEDIA_NOT_FOUND when the object is missing in storage', async () => {
        const { auth, id } = await login();
        const key = `media/${id}/${randomUUID()}.jpg`; // Not added to FakeS3

        const res = await http().patch('/users/me').set('Authorization', auth).send({ avatarKey: key });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('MEDIA_NOT_FOUND');
      });

      it('U9f 400 INVALID_MEDIA when the key is a video / violates limits', async () => {
        const { auth, id } = await login();
        const key = `media/${id}/${randomUUID()}.mp4`;
        const { getFakeS3 } = await import('../../../../test/test-utils');
        getFakeS3(app).putFakeObject(key, { contentType: 'video/mp4', size: 1000 });

        const res = await http().patch('/users/me').set('Authorization', auth).send({ avatarKey: key });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_MEDIA');
      });

      it('U9g 409 MEDIA_ALREADY_USED when the key already belongs to a post', async () => {
        const { auth, id } = await login();
        const key = `media/${id}/${randomUUID()}.jpg`;
        const { getFakeS3 } = await import('../../../../test/test-utils');
        getFakeS3(app).putFakeObject(key, { contentType: 'image/jpeg', size: 1000 });

        const prisma = (await import('../../../../test/test-utils')).getPrisma(app);
        const post = await prisma.post.create({ data: { authorId: id } });
        await prisma.postMedia.create({
          data: { postId: post.id, key, type: 'IMAGE', position: 0 },
        });

        const res = await http().patch('/users/me').set('Authorization', auth).send({ avatarKey: key });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('MEDIA_ALREADY_USED');
      });

      it('U9h 502 STORAGE_ERROR when storage fails', async () => {
        const { auth, id } = await login();
        const key = `media/${id}/${randomUUID()}.jpg`;
        const { getFakeS3 } = await import('../../../../test/test-utils');
        getFakeS3(app).failNextHead(500);

        const res = await http().patch('/users/me').set('Authorization', auth).send({ avatarKey: key });
        expect(res.status).toBe(502);
        expect(res.body.code).toBe('STORAGE_ERROR');
      });
    });

    it('U10 requires authentication: no token -> 401, suspended -> 403', async () => {
      const noToken = await http().patch('/users/me').send({ displayName: 'x' });
      expect(noToken.status).toBe(401);
      expect(noToken.body.code).toBe('UNAUTHENTICATED');

      await createUser(app, { firebaseUid: 'fb-susp', status: 'SUSPENDED' });
      const susp = await http()
        .patch('/users/me')
        .set('Authorization', bearer({ uid: 'fb-susp' }))
        .send({ displayName: 'x' });
      expect(susp.status).toBe(403);
      expect(susp.body.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('U15 updatedAt changes in the DB but is never exposed', async () => {
      const { auth, id } = await login();
      const before = await getPrisma(app).user.findUniqueOrThrow({ where: { id } });
      await new Promise((r) => setTimeout(r, 20));
      const res = await http().patch('/users/me').set('Authorization', auth).send({ bio: 'changed' });
      const after = await getPrisma(app).user.findUniqueOrThrow({ where: { id } });
      expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
      expect(res.body).not.toHaveProperty('updatedAt');
    });
  });

  describe('GET /users/:id', () => {
    it('U11 returns UserPublicDto (no status, no sensitive fields)', async () => {
      const user = await createUser(app, { displayName: 'Ahmed', bio: 'Backend dev' });
      const res = await http().get(`/users/${user.id}`);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body)).toEqual(['id', 'displayName', 'bio', 'avatarUrl', 'createdAt']);
      expect(res.body.displayName).toBe('Ahmed');
      expect(JSON.stringify(res.body)).not.toContain(user.firebaseUid);
    });

    it('U12a non-UUID id -> 400 VALIDATION_ERROR', async () => {
      const res = await http().get('/users/not-a-uuid');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('U12b unknown id -> 404 USER_NOT_FOUND', async () => {
      const res = await http().get(`/users/${randomUUID()}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ statusCode: 404, code: 'USER_NOT_FOUND', message: 'User not found' });
    });

    it('U12c suspended user is indistinguishable from a missing one (404)', async () => {
      const user = await createUser(app, { status: 'SUSPENDED' });
      const res = await http().get(`/users/${user.id}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('USER_NOT_FOUND');
    });

    it('U13 a suspended caller can still read profiles as a guest', async () => {
      await createUser(app, { firebaseUid: 'fb-susp', status: 'SUSPENDED' });
      const target = await createUser(app, { firebaseUid: 'fb-target' });
      const res = await http().get(`/users/${target.id}`).set('Authorization', bearer({ uid: 'fb-susp' }));
      expect(res.status).toBe(200);
    });

    it('U14 avatarUrl is `${MEDIA_PUBLIC_BASE_URL}/${key}` or null', async () => {
      const key = `media/${randomUUID()}/${randomUUID()}.png`;
      const withAvatar = await createUser(app, { firebaseUid: 'fb-a', avatarKey: key });
      const without = await createUser(app, { firebaseUid: 'fb-b' });
      expect((await http().get(`/users/${withAvatar.id}`)).body.avatarUrl).toBe(`https://media.test.local/${key}`);
      expect((await http().get(`/users/${without.id}`)).body.avatarUrl).toBeNull();
    });
  });
});
