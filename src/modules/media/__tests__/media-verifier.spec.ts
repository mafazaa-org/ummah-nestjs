import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createTestingApp, createUser, getFakeS3, getPrisma, resetDb } from '../../../../test/test-utils';
import { MediaService } from '../media.service';
import { FakeS3Service } from '../../../../test/fake-s3.service';

describe('Phase 2: verifyMediaKeys (Unit/Integration with FakeS3)', () => {
  let app: INestApplication;
  let mediaService: MediaService;
  let fakeS3: FakeS3Service;

  beforeAll(async () => {
    app = await createTestingApp();
    mediaService = app.get(MediaService);
    fakeS3 = getFakeS3(app);
  });

  beforeEach(async () => {
    await resetDb(app);
    fakeS3.clearFakeObjects();
  });

  afterAll(async () => {
    await app.close();
  });

  it('V1 accepts a valid uploaded image and returns verified item at position 0', async () => {
    const user = await createUser(app);
    const key = `media/${user.id}/${randomUUID()}.jpg`;

    fakeS3.putFakeObject(key, { contentType: 'image/jpeg', size: 1024 * 50 });

    const res = await mediaService.verifyMediaKeys(user.id, [key], 'POST');
    expect(res).toEqual([
      {
        key,
        type: 'IMAGE',
        position: 0,
      },
    ]);
  });

  it('V2 accepts 4 images and sets positions 0..3 preserving input order', async () => {
    const user = await createUser(app);
    const keys = [
      `media/${user.id}/${randomUUID()}.jpg`,
      `media/${user.id}/${randomUUID()}.png`,
      `media/${user.id}/${randomUUID()}.webp`,
      `media/${user.id}/${randomUUID()}.jpg`,
    ];

    fakeS3.putFakeObject(keys[0], { contentType: 'image/jpeg', size: 1000 });
    fakeS3.putFakeObject(keys[1], { contentType: 'image/png', size: 2000 });
    fakeS3.putFakeObject(keys[2], { contentType: 'image/webp', size: 3000 });
    fakeS3.putFakeObject(keys[3], { contentType: 'image/jpeg', size: 4000 });

    const res = await mediaService.verifyMediaKeys(user.id, keys, 'POST');
    expect(res).toHaveLength(4);
    expect(res.map((r) => r.position)).toEqual([0, 1, 2, 3]);
    expect(res.map((r) => r.key)).toEqual(keys);
  });

  it('V3 accepts a single valid video', async () => {
    const user = await createUser(app);
    const key = `media/${user.id}/${randomUUID()}.mp4`;

    fakeS3.putFakeObject(key, { contentType: 'video/mp4', size: 1024 * 1024 * 5 });

    const res = await mediaService.verifyMediaKeys(user.id, [key], 'POST');
    expect(res).toEqual([
      {
        key,
        type: 'VIDEO',
        position: 0,
      },
    ]);
  });

  it('V4 throws 403 MEDIA_NOT_OWNED if key does not belong to user, without making any S3 HEAD calls', async () => {
    const userA = await createUser(app);
    const userB = await createUser(app);
    const key = `media/${userB.id}/${randomUUID()}.jpg`;

    await expect(mediaService.verifyMediaKeys(userA.id, [key], 'POST')).rejects.toMatchObject({
      status: 403,
      response: { code: 'MEDIA_NOT_OWNED' },
    });

    expect(fakeS3.headCallCount).toBe(0);
  });

  it('V5 rejects with 403 MEDIA_NOT_OWNED if mix of owned and unowned keys provided', async () => {
    const userA = await createUser(app);
    const userB = await createUser(app);
    const ownKey = `media/${userA.id}/${randomUUID()}.jpg`;
    const otherKey = `media/${userB.id}/${randomUUID()}.jpg`;

    fakeS3.putFakeObject(ownKey, { contentType: 'image/jpeg', size: 100 });

    await expect(mediaService.verifyMediaKeys(userA.id, [ownKey, otherKey], 'POST')).rejects.toMatchObject({
      status: 403,
      response: { code: 'MEDIA_NOT_OWNED' },
    });

    expect(fakeS3.headCallCount).toBe(0);
  });

  it('V6 throws 400 MEDIA_NOT_FOUND when file is missing in storage', async () => {
    const user = await createUser(app);
    const key = `media/${user.id}/${randomUUID()}.jpg`;

    await expect(mediaService.verifyMediaKeys(user.id, [key], 'POST')).rejects.toMatchObject({
      status: 400,
      response: { code: 'MEDIA_NOT_FOUND' },
    });
  });

  it('V7 converts non-404 storage failure into 502 STORAGE_ERROR', async () => {
    const user = await createUser(app);
    const key = `media/${user.id}/${randomUUID()}.jpg`;

    fakeS3.failNextHead(500);

    await expect(mediaService.verifyMediaKeys(user.id, [key], 'POST')).rejects.toMatchObject({
      status: 502,
      response: { code: 'STORAGE_ERROR' },
    });
  });

  it('V8 rejects unwhitelisted Content-Type stored under valid extension with 400 INVALID_MEDIA', async () => {
    const user = await createUser(app);
    const key = `media/${user.id}/${randomUUID()}.jpg`;

    fakeS3.putFakeObject(key, { contentType: 'application/pdf', size: 100 });

    await expect(mediaService.verifyMediaKeys(user.id, [key], 'POST')).rejects.toMatchObject({
      status: 400,
      response: { code: 'INVALID_MEDIA' },
    });
  });

  it('V9 rejects extension mismatch (PNG uploaded to .jpg key) with 400 INVALID_MEDIA', async () => {
    const user = await createUser(app);
    const key = `media/${user.id}/${randomUUID()}.jpg`;

    fakeS3.putFakeObject(key, { contentType: 'image/png', size: 100 }); // expected .png, not .jpg

    await expect(mediaService.verifyMediaKeys(user.id, [key], 'POST')).rejects.toMatchObject({
      status: 400,
      response: { code: 'INVALID_MEDIA' },
    });
  });

  it('V10 rejects 0-byte or size-exceeding media with 400 INVALID_MEDIA', async () => {
    const user = await createUser(app);
    const zeroKey = `media/${user.id}/${randomUUID()}.jpg`;
    fakeS3.putFakeObject(zeroKey, { contentType: 'image/jpeg', size: 0 });

    await expect(mediaService.verifyMediaKeys(user.id, [zeroKey], 'POST')).rejects.toMatchObject({
      status: 400,
      response: { code: 'INVALID_MEDIA' },
    });

    const hugeKey = `media/${user.id}/${randomUUID()}.jpg`;
    fakeS3.putFakeObject(hugeKey, { contentType: 'image/jpeg', size: 5242880 + 1 });

    await expect(mediaService.verifyMediaKeys(user.id, [hugeKey], 'POST')).rejects.toMatchObject({
      status: 400,
      response: { code: 'INVALID_MEDIA' },
    });
  });

  it('V11 rejects mixing video and image in a single post with 400 INVALID_MEDIA_COMBINATION', async () => {
    const user = await createUser(app);
    const imgKey = `media/${user.id}/${randomUUID()}.jpg`;
    const vidKey = `media/${user.id}/${randomUUID()}.mp4`;

    fakeS3.putFakeObject(imgKey, { contentType: 'image/jpeg', size: 1000 });
    fakeS3.putFakeObject(vidKey, { contentType: 'video/mp4', size: 1000 });

    await expect(mediaService.verifyMediaKeys(user.id, [imgKey, vidKey], 'POST')).rejects.toMatchObject({
      status: 400,
      response: { code: 'INVALID_MEDIA_COMBINATION' },
    });
  });

  it('V12 rejects more than 1 video with 400 INVALID_MEDIA_COMBINATION', async () => {
    const user = await createUser(app);
    const v1 = `media/${user.id}/${randomUUID()}.mp4`;
    const v2 = `media/${user.id}/${randomUUID()}.mp4`;

    fakeS3.putFakeObject(v1, { contentType: 'video/mp4', size: 1000 });
    fakeS3.putFakeObject(v2, { contentType: 'video/mp4', size: 1000 });

    await expect(mediaService.verifyMediaKeys(user.id, [v1, v2], 'POST')).rejects.toMatchObject({
      status: 400,
      response: { code: 'INVALID_MEDIA_COMBINATION' },
    });
  });

  it('V13 for AVATAR purpose: rejects video or multiple keys', async () => {
    const user = await createUser(app);
    const vidKey = `media/${user.id}/${randomUUID()}.mp4`;
    fakeS3.putFakeObject(vidKey, { contentType: 'video/mp4', size: 1000 });

    await expect(mediaService.verifyMediaKeys(user.id, [vidKey], 'AVATAR')).rejects.toMatchObject({
      status: 400,
      response: { code: 'INVALID_MEDIA' },
    });

    const img1 = `media/${user.id}/${randomUUID()}.jpg`;
    const img2 = `media/${user.id}/${randomUUID()}.jpg`;
    fakeS3.putFakeObject(img1, { contentType: 'image/jpeg', size: 1000 });
    fakeS3.putFakeObject(img2, { contentType: 'image/jpeg', size: 1000 });

    await expect(mediaService.verifyMediaKeys(user.id, [img1, img2], 'AVATAR')).rejects.toMatchObject({
      status: 400,
      response: { code: 'INVALID_MEDIA' },
    });
  });

  it('V14 throws 409 MEDIA_ALREADY_USED if key is already associated with post_media in DB', async () => {
    const user = await createUser(app);
    const prisma = getPrisma(app);

    const post = await prisma.post.create({
      data: { authorId: user.id },
    });

    const usedKey = `media/${user.id}/${randomUUID()}.jpg`;
    await prisma.postMedia.create({
      data: {
        postId: post.id,
        key: usedKey,
        type: 'IMAGE',
        position: 0,
      },
    });

    fakeS3.putFakeObject(usedKey, { contentType: 'image/jpeg', size: 1000 });

    await expect(mediaService.verifyMediaKeys(user.id, [usedKey], 'POST')).rejects.toMatchObject({
      status: 409,
      response: { code: 'MEDIA_ALREADY_USED' },
    });
  });

  it('V15 deterministic error reporting: throws error for first faulty item in input order (Decision D1)', async () => {
    const user = await createUser(app);
    const k1 = `media/${user.id}/${randomUUID()}.jpg`; // missing -> MEDIA_NOT_FOUND
    const k2 = `media/${user.id}/${randomUUID()}.jpg`; // invalid size -> INVALID_MEDIA

    fakeS3.putFakeObject(k2, { contentType: 'image/jpeg', size: 0 });

    // With [k1, k2], k1 is checked first -> MEDIA_NOT_FOUND
    await expect(mediaService.verifyMediaKeys(user.id, [k1, k2], 'POST')).rejects.toMatchObject({
      status: 400,
      response: { code: 'MEDIA_NOT_FOUND' },
    });

    // With [k2, k1], k2 is checked first -> INVALID_MEDIA
    await expect(mediaService.verifyMediaKeys(user.id, [k2, k1], 'POST')).rejects.toMatchObject({
      status: 400,
      response: { code: 'INVALID_MEDIA' },
    });
  });

  it('V16 guards against prototype property injection in ContentType (e.g. constructor)', async () => {
    const user = await createUser(app);
    const key = `media/${user.id}/${randomUUID()}.jpg`;

    fakeS3.putFakeObject(key, { contentType: 'constructor', size: 100 });

    await expect(mediaService.verifyMediaKeys(user.id, [key], 'POST')).rejects.toMatchObject({
      status: 400,
      response: { code: 'INVALID_MEDIA' },
    });
  });

  it('V17 performs S3 HEAD requests concurrently for multiple keys', async () => {
    const user = await createUser(app);
    const keys = Array.from({ length: 4 }, () => `media/${user.id}/${randomUUID()}.jpg`);

    keys.forEach((k) => fakeS3.putFakeObject(k, { contentType: 'image/jpeg', size: 100 }));

    await mediaService.verifyMediaKeys(user.id, keys, 'POST');
    expect(fakeS3.headCallCount).toBe(4);
    expect(fakeS3.maxConcurrency).toBeGreaterThanOrEqual(2);
  });

  it('V18 rejects user id suffix attacks without slash (media/<userId>x/...)', async () => {
    const user = await createUser(app);
    const maliciousKey = `media/${user.id}fake/${randomUUID()}.jpg`;

    await expect(mediaService.verifyMediaKeys(user.id, [maliciousKey], 'POST')).rejects.toMatchObject({
      status: 403,
      response: { code: 'MEDIA_NOT_OWNED' },
    });
  });
});
