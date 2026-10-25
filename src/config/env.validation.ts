import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  MEDIA_PUBLIC_BASE_URL: z.string().url().refine((url) => !url.endsWith('/'), {
    message: 'MEDIA_PUBLIC_BASE_URL must not end with a trailing slash',
  }),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  IMAGE_MAX_BYTES: z.coerce.number().default(5242880), // 5MB
  VIDEO_MAX_BYTES: z.coerce.number().default(52428800), // 50MB
  VIDEO_MAX_SECONDS: z.coerce.number().default(60),
  PRESIGN_EXPIRES_SECONDS: z.coerce.number().default(300),
  POST_REPORT_THRESHOLD: z.coerce.number().default(7),
  USER_REPORT_THRESHOLD: z.coerce.number().default(15),
  THROTTLE_GLOBAL_LIMIT: z.coerce.number().default(100),
  THROTTLE_TTL_SECONDS: z.coerce.number().default(60),
  THROTTLE_REPORTS_LIMIT: z.coerce.number().default(5),
  THROTTLE_PRESIGN_LIMIT: z.coerce.number().default(20),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const errorMessages = result.error.errors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    throw new Error(`Environment validation failed: ${errorMessages}`);
  }
  return result.data;
}
