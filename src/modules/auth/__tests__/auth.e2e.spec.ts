import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { Controller, Get, INestApplication } from '@nestjs/common';
import { OptionalAuth, Public } from '../../../common/decorators/auth-mode.decorator';
import { AuthenticatedUser, CurrentUser } from '../../../common/decorators/current-user.decorator';
import { createTestingApp, createUser, getPrisma, makeToken, resetDb } from '../../../../test/test-utils';

// Test-only routes: GET /users/:id/posts (the real OPTIONAL route) arrives in Phase 3.
@Controller('__probe')
class ProbeController {
  @Get('mandatory')
  mandatory(@CurrentUser('id') id: string) {
    return { userId: id };
  }

  @Get('optional')
  @OptionalAuth()
  optional(@CurrentUser() user: AuthenticatedUser | null) {
    return { userId: user?.id ?? null };
  }

  @Get('public')
  @Public()
  pub(@CurrentUser() user: AuthenticatedUser | null) {
    return { userId: user?.id ?? null };
  }
}

const bearer = (claims: Parameters<typeof makeToken>[0]) => `Bearer ${makeToken(claims)}`;

describe('Phase 1: Auth & Status Enforcement (E2E)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestingApp({ controllers: [ProbeController] });
  });
  beforeEach(async () => {
    await resetDb(app);
  });
  afterAll(async () => {
    await app.close();
  });

  describe('GET /auth/me — provisioning', () => {
    it('A1 first request auto-creates the user and returns UserMeDto', async () => {
      const res = await http().get('/auth/me').set('Authorization', bearer({ uid: 'fb-1', name: 'Zaid' }));
      expect(res.status).toBe(200);
      expect(res.body.displayName).toBe('Zaid');
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.bio).toBeNull();
      expect(res.body.avatarUrl).toBeNull();
      expect(await getPrisma(app).user.count()).toBe(1);
    });

    it('A2 repeated requests are idempotent (same id, single row)', async () => {
      const auth = bearer({ uid: 'fb-1', name: 'Zaid' });
      const first = await http().get('/auth/me').set('Authorization', auth);
      const second = await http().get('/auth/me').set('Authorization', auth);
      expect(second.body.id).toBe(first.body.id);
      expect(await getPrisma(app).user.count()).toBe(1);
    });

    it('A3 derives displayName from the email local-part when name is missing', async () => {
      const res = await http()
        .get('/auth/me')
        .set('Authorization', bearer({ uid: 'fb-2', email: 'ahmed@example.com' }));
      expect(res.body.displayName).toBe('ahmed');
    });

    it("A4 falls back to 'User' when neither name nor email exist", async () => {
      const res = await http().get('/auth/me').set('Authorization', bearer({ uid: 'fb-3' }));
      expect(res.body.displayName).toBe('User');
    });

    it('A5 truncates a long name to 50 characters', async () => {
      const res = await http().get('/auth/me').set('Authorization', bearer({ uid: 'fb-4', name: 'x'.repeat(80) }));
      expect(res.status).toBe(200);
      expect(res.body.displayName).toHaveLength(50);
    });

    it('A6 a whitespace-only name falls back to the email / User', async () => {
      const res = await http()
        .get('/auth/me')
        .set('Authorization', bearer({ uid: 'fb-5', name: '   ', email: 'sara@example.com' }));
      expect(res.body.displayName).toBe('sara');
    });

    it('A15 concurrent first requests create exactly one user and all succeed', async () => {
      const auth = bearer({ uid: 'fb-race', name: 'Racer' });
      const results = await Promise.all(
        Array.from({ length: 10 }, () => http().get('/auth/me').set('Authorization', auth)),
      );
      expect(results.map((r) => r.status)).toEqual(Array(10).fill(200));
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(await getPrisma(app).user.count()).toBe(1);
    });

    it('A16/A17 /auth/me returns exactly the UserMeDto keys (no firebaseUid/reportCount/updatedAt)', async () => {
      const res = await http().get('/auth/me').set('Authorization', bearer({ uid: 'fb-1', name: 'Zaid' }));
      expect(Object.keys(res.body)).toEqual(['id', 'displayName', 'bio', 'avatarUrl', 'createdAt', 'status']);
    });
  });

  describe('MANDATORY routes — failures', () => {
    it('A7 no token -> 401 UNAUTHENTICATED', async () => {
      const res = await http().get('/auth/me');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Missing bearer token' });
    });

    it.each(['Basic abc', 'Bearer ', 'Bearer', 'abc'])('A8 malformed Authorization %j -> 401 UNAUTHENTICATED', async (h) => {
      const res = await http().get('/auth/me').set('Authorization', h);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('A9 invalid token -> 401 INVALID_TOKEN', async () => {
      const res = await http().get('/auth/me').set('Authorization', 'Bearer invalid-token-string');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ statusCode: 401, code: 'INVALID_TOKEN', message: 'Invalid or expired token' });
    });

    it('A10 suspended user -> 403 ACCOUNT_SUSPENDED', async () => {
      await createUser(app, { firebaseUid: 'fb-susp', status: 'SUSPENDED' });
      const res = await http().get('/auth/me').set('Authorization', bearer({ uid: 'fb-susp' }));
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ statusCode: 403, code: 'ACCOUNT_SUSPENDED', message: 'Account is suspended' });
    });

    it('A11 suspension takes effect on the very next request with the same valid token', async () => {
      const auth = bearer({ uid: 'fb-live', name: 'Live' });
      expect((await http().get('/auth/me').set('Authorization', auth)).status).toBe(200);

      await getPrisma(app).user.update({ where: { firebaseUid: 'fb-live' }, data: { status: 'SUSPENDED' } });

      const res = await http().get('/auth/me').set('Authorization', auth);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
    });
  });

  describe('PUBLIC routes — token is ignored', () => {
    it('A12 a suspended user can still browse PUBLIC routes as a guest', async () => {
      await createUser(app, { firebaseUid: 'fb-susp', status: 'SUSPENDED' });
      const other = await createUser(app, { firebaseUid: 'fb-other' });

      const profile = await http().get(`/users/${other.id}`).set('Authorization', bearer({ uid: 'fb-susp' }));
      expect(profile.status).toBe(200);

      const pub = await http().get('/__probe/public').set('Authorization', bearer({ uid: 'fb-susp' }));
      expect(pub.status).toBe(200);
      expect(pub.body.userId).toBeNull();

      const health = await http().get('/health').set('Authorization', bearer({ uid: 'fb-susp' }));
      expect(health.status).toBe(200);
    });

    it('A13 a garbage token on a PUBLIC route is ignored (not 401)', async () => {
      const res = await http().get('/__probe/public').set('Authorization', 'Bearer garbage');
      expect(res.status).toBe(200);
      expect(res.body.userId).toBeNull();
    });
  });

  describe('OPTIONAL routes', () => {
    it('A14a no token -> guest (user = null)', async () => {
      const res = await http().get('/__probe/optional');
      expect(res.status).toBe(200);
      expect(res.body.userId).toBeNull();
    });

    it('A14b valid token -> user is attached', async () => {
      const res = await http().get('/__probe/optional').set('Authorization', bearer({ uid: 'fb-opt' }));
      expect(res.status).toBe(200);
      expect(res.body.userId).toEqual(expect.any(String));
    });

    it('A14c invalid token -> 401 INVALID_TOKEN (never downgraded to guest)', async () => {
      const res = await http().get('/__probe/optional').set('Authorization', 'Bearer garbage');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    it('A14d suspended user -> 403 ACCOUNT_SUSPENDED', async () => {
      await createUser(app, { firebaseUid: 'fb-susp', status: 'SUSPENDED' });
      const res = await http().get('/__probe/optional').set('Authorization', bearer({ uid: 'fb-susp' }));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
    });
  });

  it('routes default to MANDATORY when no decorator is present', async () => {
    const res = await http().get('/__probe/mandatory');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });
});
