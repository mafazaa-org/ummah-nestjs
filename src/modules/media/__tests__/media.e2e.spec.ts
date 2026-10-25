import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestingApp, makeToken, resetDb } from '../../../../test/test-utils';
import { MEDIA_KEY_REGEX } from '../../../common/constants/media.constants';

const bearer = (claims: Parameters<typeof makeToken>[0]) => `Bearer ${makeToken(claims)}`;

describe('Phase 2: Media Presign (E2E)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    // Presign generation is purely local cryptographic signing: exercise real S3Service
    app = await createTestingApp({ useRealS3: true });
  });

  beforeEach(async () => {
    await resetDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('P1 returns 200 and presigned uploadUrl for valid JPEG image', async () => {
    const auth = bearer({ uid: 'fb-presign-1' });
    const meRes = await http().get('/auth/me').set('Authorization', auth);
    const userId = meRes.body.id;

    const res = await http()
      .post('/media/presign')
      .set('Authorization', auth)
      .send({
        type: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: 1024 * 500, // 500 KB
      });

    expect(res.status).toBe(200);
    expect(res.body.method).toBe('PUT');
    expect(res.body.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    expect(res.body.key).toMatch(MEDIA_KEY_REGEX);
    expect(res.body.key.startsWith(`media/${userId}/`)).toBe(true);
    expect(res.body.key.endsWith('.jpg')).toBe(true);
    expect(res.body.uploadUrl).toBeDefined();

    const expiresAtMs = new Date(res.body.expiresAt).getTime();
    expect(expiresAtMs).toBeGreaterThan(Date.now() + 250 * 1000);
    expect(expiresAtMs).toBeLessThanOrEqual(Date.now() + 301 * 1000);
  });

  it('P2 maps allowed media types to their exact expected extensions', async () => {
    const auth = bearer({ uid: 'fb-presign-types' });

    const checks = [
      { type: 'IMAGE', contentType: 'image/png', ext: '.png' },
      { type: 'IMAGE', contentType: 'image/webp', ext: '.webp' },
      { type: 'VIDEO', contentType: 'video/mp4', durationSeconds: 30, ext: '.mp4' },
      { type: 'VIDEO', contentType: 'video/quicktime', durationSeconds: 15, ext: '.mov' },
    ];

    for (const item of checks) {
      const res = await http()
        .post('/media/presign')
        .set('Authorization', auth)
        .send({
          type: item.type,
          contentType: item.contentType,
          sizeBytes: 1024 * 100,
          durationSeconds: item.durationSeconds,
        });

      expect(res.status).toBe(200);
      expect(res.body.key.endsWith(item.ext)).toBe(true);
    }
  });

  it('P3 presigned URL properties: bucket endpoint, signable headers, and NO checksum calculation params', async () => {
    const auth = bearer({ uid: 'fb-presign-props' });

    const res = await http()
      .post('/media/presign')
      .set('Authorization', auth)
      .send({
        type: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
      });

    expect(res.status).toBe(200);
    const url = new URL(res.body.uploadUrl);

    // Endpoint domain from test config (s3.test.local)
    expect(url.hostname).toContain('s3.test.local');
    // Key in pathname
    expect(decodeURIComponent(url.pathname)).toContain(res.body.key);

    const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders') || '';
    expect(signedHeaders).toContain('content-length');
    expect(signedHeaders).toContain('content-type');

    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');

    // Confirm requirement M8: no flexible checksum parameters injected
    expect(url.searchParams.get('x-amz-checksum-algorithm')).toBeNull();
    expect(url.searchParams.get('x-amz-checksum-crc32')).toBeNull();
  });

  it('P4 consecutive requests generate distinct unique keys', async () => {
    const auth = bearer({ uid: 'fb-presign-unique' });

    const r1 = await http()
      .post('/media/presign')
      .set('Authorization', auth)
      .send({ type: 'IMAGE', contentType: 'image/jpeg', sizeBytes: 1024 });

    const r2 = await http()
      .post('/media/presign')
      .set('Authorization', auth)
      .send({ type: 'IMAGE', contentType: 'image/jpeg', sizeBytes: 1024 });

    expect(r1.body.key).not.toBe(r2.body.key);
  });

  it('P5 rejects mismatched type and contentType', async () => {
    const auth = bearer({ uid: 'fb-presign-mismatch' });

    const res = await http()
      .post('/media/presign')
      .set('Authorization', auth)
      .send({
        type: 'IMAGE',
        contentType: 'video/mp4',
        sizeBytes: 1024,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.message).toContain('contentType does not match type');
  });

  it('P6 rejects non-whitelisted content types', async () => {
    const auth = bearer({ uid: 'fb-presign-nonwhite' });

    for (const ct of ['image/gif', 'image/svg+xml', 'text/html']) {
      const res = await http()
        .post('/media/presign')
        .set('Authorization', auth)
        .send({
          type: 'IMAGE',
          contentType: ct,
          sizeBytes: 1024,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  it('P7 validates sizeBytes limits for images (5MB max, min 1)', async () => {
    const auth = bearer({ uid: 'fb-presign-img-size' });

    // Exceeds 5MB
    const tooLarge = await http()
      .post('/media/presign')
      .set('Authorization', auth)
      .send({
        type: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: 5242880 + 1,
      });
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body.code).toBe('VALIDATION_ERROR');

    // Exactly 5MB
    const exact = await http()
      .post('/media/presign')
      .set('Authorization', auth)
      .send({
        type: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: 5242880,
      });
    expect(exact.status).toBe(200);

    // Invalid size <= 0
    const zeroSize = await http()
      .post('/media/presign')
      .set('Authorization', auth)
      .send({
        type: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: 0,
      });
    expect(zeroSize.status).toBe(400);
  });

  it('P8 validates sizeBytes limits for videos (50MB max)', async () => {
    const auth = bearer({ uid: 'fb-presign-vid-size' });

    const tooLarge = await http()
      .post('/media/presign')
      .set('Authorization', auth)
      .send({
        type: 'VIDEO',
        contentType: 'video/mp4',
        sizeBytes: 52428800 + 1,
        durationSeconds: 30,
      });
    expect(tooLarge.status).toBe(400);

    const exact = await http()
      .post('/media/presign')
      .set('Authorization', auth)
      .send({
        type: 'VIDEO',
        contentType: 'video/mp4',
        sizeBytes: 52428800,
        durationSeconds: 60,
      });
    expect(exact.status).toBe(200);
  });

  it('P9 validates video durationSeconds (1 to 60 seconds)', async () => {
    const auth = bearer({ uid: 'fb-presign-dur' });

    // Missing durationSeconds
    const missing = await http()
      .post('/media/presign')
      .set('Authorization', auth)
      .send({
        type: 'VIDEO',
        contentType: 'video/mp4',
        sizeBytes: 1024,
      });
    expect(missing.status).toBe(400);

    // Exceeds 60 seconds
    const tooLong = await http()
      .post('/media/presign')
      .set('Authorization', auth)
      .send({
        type: 'VIDEO',
        contentType: 'video/mp4',
        sizeBytes: 1024,
        durationSeconds: 61,
      });
    expect(tooLong.status).toBe(400);

    // Exactly 60 seconds
    const maxDur = await http()
      .post('/media/presign')
      .set('Authorization', auth)
      .send({
        type: 'VIDEO',
        contentType: 'video/mp4',
        sizeBytes: 1024,
        durationSeconds: 60,
      });
    expect(maxDur.status).toBe(200);
  });

  it('P10 ignores durationSeconds when type is IMAGE', async () => {
    const auth = bearer({ uid: 'fb-presign-img-dur' });

    const res = await http()
      .post('/media/presign')
      .set('Authorization', auth)
      .send({
        type: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        durationSeconds: 999, // Ignored
      });

    expect(res.status).toBe(200);
  });

  it('P11 rejects unknown fields (forbidNonWhitelisted)', async () => {
    const auth = bearer({ uid: 'fb-presign-unknown' });

    const res = await http()
      .post('/media/presign')
      .set('Authorization', auth)
      .send({
        type: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        extraHackerField: 'payload',
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('P12 enforces auth: 401 unauthenticated, 403 suspended', async () => {
    const noAuth = await http()
      .post('/media/presign')
      .send({ type: 'IMAGE', contentType: 'image/jpeg', sizeBytes: 1024 });
    expect(noAuth.status).toBe(401);
    expect(noAuth.body.code).toBe('UNAUTHENTICATED');

    const suspAuth = bearer({ uid: 'fb-susp-presign' });
    await http().get('/auth/me').set('Authorization', suspAuth);
    // Suspend user
    const prisma = (await import('../../../../test/test-utils')).getPrisma(app);
    await prisma.user.update({
      where: { firebaseUid: 'fb-susp-presign' },
      data: { status: 'SUSPENDED' },
    });

    const suspRes = await http()
      .post('/media/presign')
      .set('Authorization', suspAuth)
      .send({ type: 'IMAGE', contentType: 'image/jpeg', sizeBytes: 1024 });
    expect(suspRes.status).toBe(403);
    expect(suspRes.body.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('P13 leaves DB unmodified (no rows inserted in any table)', async () => {
    const auth = bearer({ uid: 'fb-presign-nodb' });
    const prisma = (await import('../../../../test/test-utils')).getPrisma(app);

    const postMediaBefore = await prisma.postMedia.count();
    const reportsBefore = await prisma.report.count();
    const postsBefore = await prisma.post.count();

    await http()
      .post('/media/presign')
      .set('Authorization', auth)
      .send({ type: 'IMAGE', contentType: 'image/jpeg', sizeBytes: 1024 });

    expect(await prisma.postMedia.count()).toBe(postMediaBefore);
    expect(await prisma.report.count()).toBe(reportsBefore);
    expect(await prisma.post.count()).toBe(postsBefore);
  });
});
