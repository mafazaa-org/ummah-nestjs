import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, User, Post } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/configure-app';
import { FirebaseService } from '../src/modules/auth/firebase.service';
import { S3Service } from '../src/modules/media/s3.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertTestDatabase } from './db-guard';
import { FakeFirebaseService, makeToken } from './fake-firebase.service';
import { FakeS3Service } from './fake-s3.service';

export { makeToken };

export interface CreateTestingAppOptions {
  controllers?: Type<unknown>[];
  useRealS3?: boolean;
}

/**
 * Boots the real AppModule with the production HTTP pipeline (configureApp),
 * swapping the Firebase verifier and S3 service by default.
 */
export async function createTestingApp(options: CreateTestingAppOptions = {}): Promise<INestApplication> {
  assertTestDatabase(process.env.DATABASE_URL);

  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(FirebaseService)
    .useClass(FakeFirebaseService);

  if (!options.useRealS3) {
    builder = builder.overrideProvider(S3Service).useClass(FakeS3Service);
  }

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  app.getHttpServer().setMaxListeners(0);
  return app;
}

export function getPrisma(app: INestApplication): PrismaService {
  return app.get(PrismaService);
}

export function getFakeS3(app: INestApplication): FakeS3Service {
  return app.get(S3Service) as FakeS3Service;
}

/** Wipes every table. Guarded: only ever runs against a *_test database. */
export async function resetDb(app: INestApplication): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);
  await getPrisma(app).$executeRawUnsafe(
    'TRUNCATE TABLE "reports", "post_media", "posts", "users" RESTART IDENTITY CASCADE',
  );
}

export function createUser(app: INestApplication, data: Partial<Prisma.UserUncheckedCreateInput> = {}): Promise<User> {
  return getPrisma(app).user.create({
    data: {
      firebaseUid: `fb-${Math.random().toString(36).slice(2)}`,
      displayName: 'Test User',
      ...data,
    },
  });
}

export function createPost(app: INestApplication, data: Partial<Prisma.PostUncheckedCreateInput> & { authorId: string }): Promise<Post> {
  return getPrisma(app).post.create({
    data: {
      text: 'Default post text',
      status: 'ACTIVE',
      ...data,
    },
  });
}


export function putFakeImage(app: INestApplication, userId: string, customUuid = randomUUID()): string {
  const key = `media/${userId}/${customUuid}.jpg`;
  getFakeS3(app).putFakeObject(key, {
    contentType: 'image/jpeg',
    size: 1024 * 50,
  });
  return key;
}

export function putFakeVideo(app: INestApplication, userId: string, customUuid = randomUUID()): string {
  const key = `media/${userId}/${customUuid}.mp4`;
  getFakeS3(app).putFakeObject(key, {
    contentType: 'video/mp4',
    size: 1024 * 500,
  });
  return key;
}

