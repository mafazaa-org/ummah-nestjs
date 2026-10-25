import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AllExceptionsFilter } from './exceptions/all-exceptions.filter';

/**
 * Single source of truth for the HTTP pipeline. Used by main.ts AND the E2E test app,
 * so tests always exercise exactly what production runs.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.use(helmet());

  const corsOrigins = config
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
}
