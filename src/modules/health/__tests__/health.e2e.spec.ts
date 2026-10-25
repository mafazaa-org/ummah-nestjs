import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../../app.module';
import { AllExceptionsFilter } from '../../../common/exceptions/all-exceptions.filter';
import { PrismaService } from '../../../prisma/prisma.service';

describe('Phase 0: Health & Global Foundation (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('[Positive] GET /health returns 200 and db up', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('up');
    expect(res.body.timestamp).toBeDefined();
  });

  it('[Negative] GET /unknown-route returns 404 in standard error JSON shape', async () => {
    const res = await request(app.getHttpServer()).get('/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Resource not found',
    });
  });

  it('[Negative] GET /health returns 503 when DB connection fails', async () => {
    const querySpy = vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('Connection lost'));
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database unavailable',
    });
    querySpy.mockRestore();
  });
});
