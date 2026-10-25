import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPost,
  createTestingApp,
  createUser,
  makeToken,
  resetDb,
} from '../../../../test/test-utils';

const bearer = (claims: Parameters<typeof makeToken>[0]) => `Bearer ${makeToken(claims)}`;

describe('Phase 5: Reports Throttler (E2E)', () => {
  let app: INestApplication;
  const originalReportsLimit = process.env.THROTTLE_REPORTS_LIMIT;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    // Specifically set the reports throttle limit to the BRD specification (5 req/min)
    process.env.THROTTLE_REPORTS_LIMIT = '5';
    app = await createTestingApp();
  });

  beforeEach(async () => {
    await resetDb(app);
  });

  afterAll(async () => {
    process.env.THROTTLE_REPORTS_LIMIT = originalReportsLimit;
    await app.close();
  });

  it('allows up to 5 report requests per 60s and blocks the 6th with 429 TOO_MANY_REQUESTS', async () => {
    const author = await createUser(app);
    // Create multiple posts so that reports don't trigger the post threshold or duplicate constraints
    const posts = await Promise.all([
      createPost(app, { authorId: author.id }),
      createPost(app, { authorId: author.id }),
      createPost(app, { authorId: author.id }),
      createPost(app, { authorId: author.id }),
      createPost(app, { authorId: author.id }),
      createPost(app, { authorId: author.id }),
    ]);

    // Send 5 consecutive requests from different users (same client IP)
    for (let i = 0; i < 5; i++) {
      const res = await http()
        .post(`/posts/${posts[i].id}/report`)
        .set('Authorization', bearer({ uid: `throttle-user-${i}` }))
        .send({ reason: 'SPAM' });

      expect(res.status).toBe(201);
    }

    // 6th request within the same 60s window from the same client IP
    const sixthRes = await http()
      .post(`/posts/${posts[5].id}/report`)
      .set('Authorization', bearer({ uid: 'throttle-user-5' }))
      .send({ reason: 'SPAM' });

    expect(sixthRes.status).toBe(429);
    expect(sixthRes.body.code).toBe('TOO_MANY_REQUESTS');
    expect(sixthRes.body.statusCode).toBe(429);
  });
});
