import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestingApp, makeToken, resetDb } from '../../../../test/test-utils';

const bearer = (claims: Parameters<typeof makeToken>[0]) => `Bearer ${makeToken(claims)}`;

describe('Phase 6: Security, Limits & Pipeline Hardening (E2E)', () => {
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

  describe('Payload Size Limit (100kb DoS Defense)', () => {
    it('rejects a JSON payload exceeding 100kb with 413 Payload Too Large', async () => {
      // 105 KB payload
      const largeText = 'a'.repeat(105 * 1024);
      const res = await http()
        .post('/posts')
        .set('Authorization', bearer({ uid: 'large-payload-user' }))
        .send({ text: largeText });

      expect(res.status).toBe(413);
      expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('accepts a valid JSON payload under 100kb', async () => {
      // Valid post text under 2000 chars (< 2 KB)
      const res = await http()
        .post('/posts')
        .set('Authorization', bearer({ uid: 'normal-user' }))
        .send({ text: 'Valid post under size limit' });

      expect(res.status).toBe(201);
      expect(res.body.text).toBe('Valid post under size limit');
    });
  });

  describe('Security Headers (Helmet)', () => {
    it('sets standard security defensive headers on HTTP responses', async () => {
      const res = await http().get('/health');

      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['strict-transport-security']).toBeDefined();
    });
  });

  describe('CORS Whitelist Enforcement', () => {
    it('allows requests from whitelisted origin in CORS_ORIGINS', async () => {
      const res = await http()
        .get('/health')
        .set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('does not allow requests from unauthorized origins', async () => {
      const res = await http()
        .get('/health')
        .set('Origin', 'http://unauthorized-malicious-domain.com');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Rate Limiting Immunity on Health Route (@SkipThrottle)', () => {
    it('handles over 100 rapid requests on GET /health without ever triggering 429', async () => {
      // Send 105 requests in rapid bursts
      const requests = Array.from({ length: 105 }, () => http().get('/health'));
      const responses = await Promise.all(requests);

      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.db).toBe('up');
      }
    });
  });
});
