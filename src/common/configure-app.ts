import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { json } from 'express';
import { AllExceptionsFilter } from './exceptions/all-exceptions.filter';

/**
 * Single source of truth for the HTTP pipeline. Used by main.ts AND the E2E test app,
 * so tests always exercise exactly what production runs.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  // 1) Security Headers
  app.use(helmet());

  // 2) Body Parser Hard Ceiling (DoS Defense - 100kb limit)
  app.use(json({ limit: '100kb' }));

  // 3) Strict Whitelist CORS
  const corsOrigins = config
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });

  // 4) Strict DTO Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 5) Uniform Exception Filter
  app.useGlobalFilters(new AllExceptionsFilter());
}
