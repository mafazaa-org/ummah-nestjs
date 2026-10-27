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

  // V2: Redis & Queues
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // V2: ClamAV Antivirus
  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.coerce.number().default(3310),

  // V2: LiveKit SFU Audio Calls
  LIVEKIT_URL: z.string().url().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),

  // V2: Private Chat Storage (S3/R2)
  CHAT_STORAGE_BUCKET: z.string().default('ummah-chat-dev'),

  // V2: Business Limits
  GROUP_MAX_MEMBERS: z.coerce.number().default(256),
  CHAT_TEXT_MAX: z.coerce.number().default(4000),
  CHAT_CAPTION_MAX: z.coerce.number().default(1024),
  EDIT_WINDOW_MINUTES: z.coerce.number().default(15),
  READ_RECEIPT_MAX_MEMBERS: z.coerce.number().default(32),
  CHAT_IMAGE_MAX_BYTES: z.coerce.number().default(5242880),
  CHAT_VIDEO_MAX_BYTES: z.coerce.number().default(52428800),
  CHAT_VIDEO_MAX_SECONDS: z.coerce.number().default(60),
  CHAT_FILE_MAX_BYTES: z.coerce.number().default(104857600),
  VOICE_MAX_BYTES: z.coerce.number().default(10485760),
  VOICE_MAX_SECONDS: z.coerce.number().default(300),
  PRESIGN_GET_EXPIRES_SECONDS: z.coerce.number().default(300),
  CALL_MAX_PARTICIPANTS: z.coerce.number().default(8),
  CALL_RING_TIMEOUT_SECONDS: z.coerce.number().default(45),
  CALL_GROUP_MAX_MEMBERS: z.coerce.number().default(32),
  LIVEKIT_TOKEN_TTL_SECONDS: z.coerce.number().default(120),
  HISTORY_PAGE_MAX: z.coerce.number().default(100),
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
