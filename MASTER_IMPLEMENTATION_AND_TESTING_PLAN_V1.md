# Master Implementation & Testing Plan — Backend V1 (Ummah App)
## الدليل التنفيذي الشامل وخطة العمل والاختبارات الدقيقة من الصفر حتى الإنتاج

> **وثيقة معيارية ملزمة:** هذا الملف مشتق بالكامل وبالحرف من وثيقتي:
> 1. `BRD_PRD_Backend_V1_Technical_Specification.md`
> 2. `توثيق الـBackend — النسخة الأولى (V1).md`
> 
> **قاعدة التطبيق الصارمة:** لا يُسمح بإضافة أي ميزة خارج نطاق V1 (ممنوع Likes, Comments, Follows, Notifications, Search, Admin Panel, Microservices Runtime). تم تصميم الهيكلية بنمط **Modular Monolith (Clean OOP Architecture)** لضمان فصل الاهتمامات بالكامل، بحيث يمكن مستقبلاً تحويل أي Module إلى Microservice مستقل بجهد ضئيل دون كسر أي كود.

---

## 1. الهيكلية المعمارية وأنماط التصميم (Architecture & Design Patterns)

### 1.1 فلسفة الـ Architecture (Microservices-Ready Modular Monolith)
- **Modular Isolation:** كل ميزة (Feature) معزولة داخل Module مستقل بذاته داخل مجلد `src/modules/` له مدخلاته (DTOs)، ومتحكماته (Controllers)، ومنطقه البرمجي (Services)، وطبقة بياناته (Repositories/Prisma).
- **Zero Cross-Module Tangling:** لا يجوز لأي Module التعديل على بيانات Module آخر مباشرة؛ الاتصال بين الـ Modules يتم عبر Services المصدرة فقط أو أحداث صريحة.
- **Microservices Extensibility:** الفصل التام لطبقات الـ DTOs والـ Business Logic عن بروتوكول HTTP يسمح بنقل أي Module (مثل Media أو Feed) إلى Microservice مستقل بنظام gRPC أو Message Broker في V2 دون إعادة كتابة المنطق الأساسي.

### 1.2 أنماط التصميم المعتمدة (Design Patterns)
1. **Repository / Data Access Pattern:** فصل استعلامات Prisma المعقدة وفلاتر الـ `status` خلف Repositories أو Helper Services موحدة لمنع تكرار شروط الفلترة (`P6: Query-Layer Filtering`).
2. **Strategy / Guard Pattern:** حراسة المسارات عبر `AuthGuard` عام (`APP_GUARD`) يدعم ثلاث استراتيجيات عبر الـ Reflectors:
   - `MANDATORY` (الافتراضي الصارم)
   - `PUBLIC` (تجاهل التوكن بالكامل)
   - `OPTIONAL` (قراءة التوكن إن وُجد دون إمكانية التراجع للزائر عند تلف التوكن)
3. **Transaction Template / Unit of Work Pattern:** تنفيذ العمليات الحساسة (مثل الإبلاغ والرقابة في `POST /posts/:id/report`) داخل Atomic DB Transaction بقفل تسلسلي صلب (`FOR UPDATE`: المنشور أولاً ثم المستخدم) لمنع الـ Race Conditions والـ Deadlocks.
4. **Transform & Sanitization Pipe Pattern:** تنقية وتطهير المدخلات قبل وصولها إلى الـ Business Logic عبر `Transform` و `sanitizeText`.

---

## 2. الهيكل الشجري للمشروع (Project File Tree)

```text
c:\projects\mafaza\new ommah app\
├── .env.example
├── .gitignore
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── prisma/
│   └── schema.prisma
├── scripts/
│   ├── cleanup-orphan-media.ts
│   └── seed.ts
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── config/
    │   ├── env.validation.ts
    │   └── configuration.ts
    ├── common/
    │   ├── constants/
    │   │   ├── auth-mode.constant.ts
    │   │   └── limits.constant.ts
    │   ├── decorators/
    │   │   ├── auth-mode.decorator.ts
    │   │   └── current-user.decorator.ts
    │   ├── exceptions/
    │   │   ├── app.exception.ts
    │   │   └── all-exceptions.filter.ts
    │   ├── guards/
    │   │   └── auth.guard.ts
    │   └── utils/
    │       ├── cursor.util.ts
    │       ├── sanitizer.util.ts
    │       └── status-filters.ts
    ├── prisma/
    │   ├── prisma.module.ts
    │   └── prisma.service.ts
    └── modules/
        ├── health/
        │   ├── health.controller.ts
        │   ├── health.module.ts
        │   └── __tests__/
        │       └── health.e2e.spec.ts
        ├── auth/
        │   ├── auth.controller.ts
        │   ├── auth.service.ts
        │   ├── auth.module.ts
        │   ├── firebase.service.ts
        │   └── __tests__/
        │       └── auth.e2e.spec.ts
        ├── users/
        │   ├── dto/
        │   │   └── update-profile.dto.ts
        │   ├── users.controller.ts
        │   ├── users.service.ts
        │   ├── users.module.ts
        │   └── __tests__/
        │       └── users.e2e.spec.ts
        ├── media/
        │   ├── dto/
        │   │   └── presign.dto.ts
        │   ├── media.controller.ts
        │   ├── media.service.ts
        │   ├── s3.service.ts
        │   ├── media.module.ts
        │   └── __tests__/
        │       └── media.e2e.spec.ts
        ├── posts/
        │   ├── dto/
        │   │   ├── create-post.dto.ts
        │   │   ├── update-post.dto.ts
        │   │   └── pagination-query.dto.ts
        │   ├── posts.controller.ts
        │   ├── posts.service.ts
        │   ├── posts.module.ts
        │   └── __tests__/
        │       └── posts.e2e.spec.ts
        ├── feed/
        │   ├── feed.controller.ts
        │   ├── feed.service.ts
        │   ├── feed.module.ts
        │   └── __tests__/
        │       └── feed.e2e.spec.ts
        └── reports/
            ├── dto/
            │   └── report-post.dto.ts
            ├── reports.controller.ts
            ├── reports.service.ts
            ├── reports.module.ts
            └── __tests__/
                └── reports.e2e.spec.ts
```

---

## 3. المراحل التنفيذية المتسلسلة (Step-by-Step Execution Plan)

---

### المرحلة 0: الأساس والبنية التحتية (Foundation & Global Infrastructure)

#### 0.1 الهدف والنطاق
تهيئة المشروع من الصفر التام: تثبيت الاعتماديات، تهيئة قاعدة بيانات PostgreSQL عبر Docker Compose، إعداد Prisma ومخطط البيانات الدقيق مع الـ Migrations، بناء نظام التحقق من متغيرات البيئة عند الإقلاع الصارم، تفعيل الـ Global Exception Filter المتوافق حرفياً مع مواصفات الـ BRD، وإعداد مسار فحص الصحة `GET /health`.

#### 0.2 الشروط المسبقة (Prerequisites)
- تثبيت Node.js v20+ و npm.
- تثبيت وتفعيل Docker لتشغيل PostgreSQL محلياً.

#### 0.3 الملفات وأوامر التنفيذ التفصيلية

##### أ) تهيئة الحزم وملف `package.json`:
قم بتثبيت الحزم المطلوبة عبر الأوامر التالية:
```bash
npm init -y
npm install @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/config @nestjs/swagger @nestjs/throttler @prisma/client prisma class-validator class-transformer firebase-admin @aws-sdk/client-s3 @aws-sdk/s3-request-presigner helmet nestjs-pino pino pino-pretty zod
npm install --save-dev typescript @types/node @types/express vitest supertest @types/supertest unplugin-swc @swc/core
```

##### ب) ملف `docker-compose.yml`:
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    container_name: ummah_postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgrespassword
      POSTGRES_DB: ummah_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

##### ج) ملف `prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserStatus {
  ACTIVE
  SUSPENDED
}

enum PostStatus {
  ACTIVE
  HIDDEN
  DELETED
}

enum MediaType {
  IMAGE
  VIDEO
}

enum ReportReason {
  RELIGIOUS_VIOLATION
  VIOLENCE
  SPAM
  OTHER
}

model User {
  id          String     @id @default(uuid())
  firebaseUid String     @unique
  displayName String     @db.VarChar(50)
  bio         String?    @db.VarChar(160)
  avatarKey   String?
  status      UserStatus @default(ACTIVE)
  reportCount Int        @default(0)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  posts       Post[]
  reportsMade Report[]   @relation("ReportsMade")

  @@map("users")
}

model Post {
  id          String     @id @default(uuid())
  authorId    String
  author      User       @relation(fields: [authorId], references: [id], onDelete: Restrict)
  text        String?    @db.VarChar(2000)
  status      PostStatus @default(ACTIVE)
  reportCount Int        @default(0)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  media       PostMedia[]
  reports     Report[]

  @@index([status, createdAt(sort: Desc), id(sort: Desc)])
  @@index([authorId, createdAt(sort: Desc)])
  @@map("posts")
}

model PostMedia {
  id        String    @id @default(uuid())
  postId    String
  post      Post      @relation(fields: [postId], references: [id], onDelete: Cascade)
  key       String    @unique
  type      MediaType
  position  Int
  createdAt DateTime  @default(now())

  @@unique([postId, position])
  @@index([postId])
  @@map("post_media")
}

model Report {
  id         String       @id @default(uuid())
  postId     String
  post       Post         @relation(fields: [postId], references: [id], onDelete: Cascade)
  reporterId String
  reporter   User         @relation("ReportsMade", fields: [reporterId], references: [id], onDelete: Restrict)
  reason     ReportReason
  createdAt  DateTime     @default(now())

  @@unique([postId, reporterId])
  @@index([postId])
  @@map("reports")
}
```

##### د) إعداد التحقق من البيئة الصارم `src/config/env.validation.ts`:
```ts
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
  POST_TEXT_MAX: z.coerce.number().default(2000),
  MEDIA_MAX_PER_POST: z.coerce.number().default(4),
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
```

##### هـ) معالجة الأخطاء الموحدة `src/common/exceptions/all-exceptions.filter.ts`:
```ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response, Request } from 'express';
import { AppException } from './app.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';

    if (exception instanceof AppException) {
      statusCode = exception.getStatus();
      code = exception.code;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse() as any;
      if (statusCode === HttpStatus.BAD_REQUEST) {
        code = 'VALIDATION_ERROR';
        message = Array.isArray(response?.message) ? response.message.join('; ') : response?.message || 'Bad request';
      } else if (statusCode === HttpStatus.NOT_FOUND) {
        code = 'NOT_FOUND';
        message = 'Resource not found';
      } else if (statusCode === HttpStatus.TOO_MANY_REQUESTS) {
        code = 'TOO_MANY_REQUESTS';
        message = 'Too many requests, please try again later';
      } else {
        code = response?.code || 'HTTP_ERROR';
        message = response?.message || exception.message;
      }
    }

    res.status(statusCode).json({
      statusCode,
      code,
      message,
    });
  }
}
```

##### و) فحص الصحة `src/modules/health/health.controller.ts`:
```ts
import { Controller, Get, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../../common/decorators/auth-mode.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { AppException } from '../../common/exceptions/app.exception';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  @SkipThrottle()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        db: 'up',
        timestamp: new Date().toISOString(),
      };
    } catch (e) {
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', 'Database unavailable');
    }
  }
}
```

#### 0.4 معايير القبول والرفض (Acceptance & Rejection Criteria)
- **معيار القبول (Pass):**
  - تشغيل الأمر `npx prisma migrate dev --name init` ينجح وينشئ الجداول والفهارس المطابقة لـ `schema.prisma`.
  - تشغيل الخادم والاتصال بـ `GET /health` يرجع كود `200` مع `{ "status": "ok", "db": "up", "timestamp": "..." }`.
  - طلب مسار غير موجود يرجع كود `404` بالهيكل الموحد `{ statusCode: 404, code: 'NOT_FOUND', message: 'Resource not found' }`.
- **معيار الرفض (Fail):**
  - تشغيل السيرفر مع غياب متغير بيئة أساسي (مثل `DATABASE_URL`) دون أن يفشل الإقلاع فوراً.
  - تسريب أي Stack Trace أو كود Prisma عند وقوع خطأ.

#### 0.5 حزمة اختبارات المرحلة 0 (Vitest + Supertest)
الملف: `src/modules/health/__tests__/health.e2e.spec.ts`
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  // العملية الإيجابية (Positive Test)
  it('[Positive] GET /health returns 200 and db up', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('up');
    expect(res.body.timestamp).toBeDefined();
  });

  // العملية المضادة 1: مسار غير موجود
  it('[Negative] GET /unknown-route returns 404 in standard error JSON shape', async () => {
    const res = await request(app.getHttpServer()).get('/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Resource not found',
    });
  });

  // العملية المضادة 2: محاكاة سقوط قاعدة البيانات
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
```

#### 0.6 أمر فحص الانحدار (Regression Check Command)
```bash
npx vitest run src/modules/health
```

---

### المرحلة 1: الهوية والمصادقة والملف الشخصي (Auth, Users & Status Enforcement)

#### 1.1 الهدف والنطاق
- بناء وتفعيل `AuthGuard` كحارس عام (`APP_GUARD`) يطبق استراتيجيات `MANDATORY` و `PUBLIC` و `OPTIONAL`.
- فحص توكن Firebase والتحقق منه، وإجراء الـ Auto-provisioning للمستخدم الجديد عبر `User.upsert` مع معالجة سباق التزامن `P2002`.
- فرض فحص حالة الحساب (`user.status === 'SUSPENDED'`) من قاعدة البيانات مباشرة في كل طلب برفضه بـ `403 ACCOUNT_SUSPENDED`.
- تنفيذ endpoints:
  - `GET /auth/me` (Mandatory Auth)
  - `GET /users/:id` (Public)
  - `PATCH /users/me` (Mandatory Auth)

#### 1.2 الشروط المسبقة (Prerequisites)
- اكتمال المرحلة 0 ونجاح كافة اختبارات فحص الصحة والاتصال بـ PostgreSQL.

#### 1.3 الملفات وأوامر التنفيذ التفصيلية

##### أ) الـ Decorators والـ Guard العام `src/common/guards/auth.guard.ts`:
```ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_MODE_KEY, AuthMode } from '../decorators/auth-mode.decorator';
import { FirebaseService } from '../../modules/auth/firebase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../exceptions/app.exception';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly firebase: FirebaseService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const mode = this.reflector.get<AuthMode>(AUTH_MODE_KEY, context.getHandler()) ?? 'MANDATORY';
    const req = context.switchToHttp().getRequest();

    // 1) Guest Mode
    if (mode === 'PUBLIC') {
      req.user = null;
      return true;
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
      if (mode === 'OPTIONAL') {
        req.user = null;
        return true;
      }
      throw new AppException(401, 'UNAUTHENTICATED', 'Missing bearer token');
    }

    // 2) Verify Firebase ID Token (Never downgrade to guest on present-but-invalid token)
    let decoded;
    try {
      decoded = await this.firebase.verifyIdToken(token);
    } catch {
      throw new AppException(401, 'INVALID_TOKEN', 'Invalid or expired token');
    }

    // 3) Auto-provision user (atomic upsert)
    const displayName = (decoded.name?.trim() || decoded.email?.split('@')[0] || 'User').slice(0, 50);
    let user;
    try {
      user = await this.prisma.user.upsert({
        where: { firebaseUid: decoded.uid },
        update: {},
        create: {
          firebaseUid: decoded.uid,
          displayName,
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        user = await this.prisma.user.findUniqueOrThrow({ where: { firebaseUid: decoded.uid } });
      } else {
        throw e;
      }
    }

    // 4) Status Enforcement on EVERY request
    if (user.status === 'SUSPENDED') {
      throw new AppException(403, 'ACCOUNT_SUSPENDED', 'Account is suspended');
    }

    req.user = { id: user.id, firebaseUid: user.firebaseUid, status: user.status };
    return true;
  }
}
```

##### ب) مسارات المستخدمين `src/modules/users/users.controller.ts`:
```ts
import { Controller, Get, Patch, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/auth-mode.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me')
  async updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get(':id')
  @Public()
  async getPublicProfile(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.getPublicProfile(id);
  }
}
```

##### ج) منطق الـ Profile في `src/modules/users/users.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AppException } from '../../common/exceptions/app.exception';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.displayName === undefined && dto.bio === undefined && dto.avatarKey === undefined) {
      throw new AppException(400, 'EMPTY_UPDATE', 'At least one field must be provided');
    }

    const data: any = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.bio !== undefined) data.bio = dto.bio === '' ? null : dto.bio;
    if (dto.avatarKey !== undefined) data.avatarKey = dto.avatarKey;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    return {
      id: user.id,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarKey ? `${process.env.MEDIA_PUBLIC_BASE_URL}/${user.avatarKey}` : null,
      createdAt: user.createdAt.toISOString(),
      status: user.status,
    };
  }

  async getPublicProfile(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, status: 'ACTIVE' },
    });
    if (!user) {
      throw new AppException(404, 'USER_NOT_FOUND', 'User not found');
    }
    return {
      id: user.id,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarKey ? `${process.env.MEDIA_PUBLIC_BASE_URL}/${user.avatarKey}` : null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
```

#### 1.4 معايير القبول والرفض (Acceptance & Rejection Criteria)
- **معيار القبول (Pass):**
  - أول طلب بـ Bearer Token صالح يقوم بإنشاء المستخدم تلقائياً ويرجع بياناته.
  - المستخدم صاحب `status = 'SUSPENDED'` يُحرم فوراً بكود `403` مع `{ code: 'ACCOUNT_SUSPENDED' }`.
  - لا يتم إرجاع `firebaseUid` أو `reportCount` في أي استجابة بروفايل عام أو خاص.
- **معيار الرفض (Fail):**
  - قبول طلب دون توكن على مسار إجباري.
  - تخفيض التوكن التالف على مسار اختياري لصفة زائر (يجب إرجاع `401 INVALID_TOKEN`).
  - السماح بتعديل البروفايل بـ Body فارغ `{}`.

#### 1.5 حزمة اختبارات المرحلة 1 (Vitest + Supertest)
الملف: `src/modules/auth/__tests__/auth.e2e.spec.ts` و `src/modules/users/__tests__/users.e2e.spec.ts`
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestingApp, mockValidToken, mockSuspendedUser } from '../../../test/test-utils';

describe('Phase 1: Auth, Users & Status Enforcement (E2E)', () => {
  let app: any;

  beforeAll(async () => {
    app = await createTestingApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // العملية الإيجابية 1: Auto-provisioning & GET /auth/me
  it('[Positive] GET /auth/me auto-creates user and returns UserMeDto', async () => {
    const token = mockValidToken({ uid: 'fb-user-1', name: 'Zaid' });
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Zaid');
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.firebaseUid).toBeUndefined(); // منع كشف الـ UID
  });

  // العملية الإيجابية 2: تحديث البروفايل PATCH /users/me
  it('[Positive] PATCH /users/me updates displayName and bio', async () => {
    const token = mockValidToken({ uid: 'fb-user-1' });
    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Zaid Updated', bio: 'My new bio' });

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Zaid Updated');
    expect(res.body.bio).toBe('My new bio');
  });

  // العملية المضادة 1: طلب مسار إجباري بدون توكن
  it('[Negative] GET /auth/me without token returns 401 UNAUTHENTICATED', async () => {
    const res = await request(app.getHttpServer()).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  // العملية المضادة 2: توكن تالف
  it('[Negative] GET /auth/me with invalid token returns 401 INVALID_TOKEN', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer invalid-token-string');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  // العملية المضادة 3: مستخدم معلق يطلب مسار مصادق
  it('[Negative] GET /auth/me with suspended user returns 403 ACCOUNT_SUSPENDED', async () => {
    const suspendedToken = await mockSuspendedUser(app, 'fb-suspended-1');
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${suspendedToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
  });

  // العملية المضادة 4: تحديث البروفايل بجسم فارغ
  it('[Negative] PATCH /users/me with empty body returns 400 EMPTY_UPDATE', async () => {
    const token = mockValidToken({ uid: 'fb-user-1' });
    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMPTY_UPDATE');
  });
});
```

#### 1.6 أمر فحص الانحدار (Regression Check Command)
```bash
npx vitest run src/modules/health src/modules/auth src/modules/users
```

---

### المرحلة 2: رفع الميديا المباشر والتحقق (Direct Media Upload & Storage Verification)

#### 2.1 الهدف والنطاق
- عدم استلام السيرفر لأي ملفات إطلاقاً (`P4: Direct Upload`).
- تنفيذ `POST /media/presign` لإصدار رابط رفع موقع بـ S3/R2 مع حظر رفع ما يخالف الحجم والنوع.
- تنفيذ دالة التحقق المركزية `verifyMediaKeys(userId, keys, purpose)`:
  - التحقق الصارم من بادئة الملكية (`media/{userId}/`).
  - فحص وجود الملف وحجمه ونوعه عبر `HEAD` متوازية على S3.
  - تطبيق قواعد التجميع: حتى 4 صور أو فيديو واحد فقط، ومنع خلط الصور بالفيديو. للأفاتار: صورة واحدة فقط.
  - منع إعادة استخدام نفس المفتاح في أكثر من منشور (`409 MEDIA_ALREADY_USED`).

#### 2.2 الشروط المسبقة (Prerequisites)
- اكتمال المرحلتين 0 و 1 مع نجاح كافة اختبارات الـ Auth والـ Users.

#### 2.3 الملفات وأوامر التنفيذ التفصيلية

##### أ) خدمة إصدار روابط الرفع الموقعة `src/modules/media/s3.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { PresignDto } from './dto/presign.dto';
import { AppException } from '../../common/exceptions/app.exception';

const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const VIDEO_EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov' };

@Injectable()
export class S3Service {
  private s3: S3Client;

  constructor() {
    this.s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || 'auto',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }

  async generatePresignedUrl(userId: string, dto: PresignDto) {
    const extMap = dto.type === 'IMAGE' ? IMAGE_EXT : VIDEO_EXT;
    const ext = extMap[dto.contentType];
    if (!ext) {
      throw new AppException(400, 'VALIDATION_ERROR', 'contentType does not match type');
    }

    const maxBytes = dto.type === 'IMAGE' ? Number(process.env.IMAGE_MAX_BYTES) : Number(process.env.VIDEO_MAX_BYTES);
    if (dto.sizeBytes > maxBytes) {
      throw new AppException(400, 'VALIDATION_ERROR', `sizeBytes exceeds ${maxBytes}`);
    }

    if (dto.type === 'VIDEO' && (!dto.durationSeconds || dto.durationSeconds > Number(process.env.VIDEO_MAX_SECONDS))) {
      throw new AppException(400, 'VALIDATION_ERROR', `durationSeconds must be between 1 and ${process.env.VIDEO_MAX_SECONDS}`);
    }

    const key = `media/${userId}/${randomUUID()}.${ext}`;
    const cmd = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
      ContentType: dto.contentType,
      ContentLength: dto.sizeBytes,
    });

    const expiresIn = Number(process.env.PRESIGN_EXPIRES_SECONDS) || 300;
    const uploadUrl = await getSignedUrl(this.s3, cmd, {
      expiresIn,
      signableHeaders: new Set(['content-type', 'content-length']),
    });

    return {
      uploadUrl,
      key,
      method: 'PUT',
      headers: { 'Content-Type': dto.contentType },
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  async headObject(key: string) {
    try {
      return await this.s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
    } catch (e: any) {
      if (e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) {
        throw new AppException(400, 'MEDIA_NOT_FOUND', 'One or more media files were not uploaded');
      }
      throw new AppException(502, 'STORAGE_ERROR', 'Storage service error');
    }
  }
}
```

##### ب) دالة التحقق المركزية `src/modules/media/media.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { S3Service } from './s3.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { MediaType } from '@prisma/client';

@Injectable()
export class MediaService {
  constructor(private readonly s3: S3Service, private readonly prisma: PrismaService) {}

  async verifyMediaKeys(userId: string, keys: string[], purpose: 'POST' | 'AVATAR') {
    const prefix = `media/${userId}/`;

    // 1) Ownership
    for (const key of keys) {
      if (!key.startsWith(prefix)) {
        throw new AppException(403, 'MEDIA_NOT_OWNED', 'Media key does not belong to the current user');
      }
    }

    // 2) Parallel HEAD Verification
    const verified = await Promise.all(
      keys.map(async (key, position) => {
        const head = await this.s3.headObject(key);
        const ct = head.ContentType ?? '';
        const size = head.ContentLength ?? 0;
        const ext = key.split('.').pop();

        const type: MediaType | null = ct in { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1 }
          ? 'IMAGE'
          : ct in { 'video/mp4': 1, 'video/quicktime': 1 }
          ? 'VIDEO'
          : null;

        const maxBytes = type === 'IMAGE' ? Number(process.env.IMAGE_MAX_BYTES) : Number(process.env.VIDEO_MAX_BYTES);
        if (!type || size < 1 || size > maxBytes) {
          throw new AppException(400, 'INVALID_MEDIA', 'Media file violates type or size limits');
        }

        return { key, type, position };
      }),
    );

    // 3) Combination rules
    const videos = verified.filter((m) => m.type === 'VIDEO').length;
    if (purpose === 'AVATAR') {
      if (verified.length !== 1 || videos > 0) {
        throw new AppException(400, 'INVALID_MEDIA', 'Media file violates type or size limits');
      }
    } else if (videos > 0 && verified.length !== 1) {
      throw new AppException(400, 'INVALID_MEDIA_COMBINATION', 'A post supports up to 4 images or exactly 1 video, not both');
    }

    // 4) Reuse Guard
    const used = await this.prisma.postMedia.findFirst({
      where: { key: { in: keys } },
      select: { key: true },
    });
    if (used) {
      throw new AppException(409, 'MEDIA_ALREADY_USED', 'Media key is already in use');
    }

    return verified;
  }
}
```

#### 2.4 معايير القبول والرفض (Acceptance & Rejection Criteria)
- **معيار القبول (Pass):**
  - طلب Presign لصورة أو فيديو صالح يرجع رابطاً موقعاً يحوي مفتاحاً يبدأ بـ `media/<userId>/`.
  - دالة `verifyMediaKeys` تقبل المفاتيح المرفوعة بنجاح وتستخرج ترتيبها بدقة.
- **معيار الرفض (Fail):**
  - محاولة استخدام مفتاح لا يبدأ بـ `media/<userId>/` دون إرجاع `403 MEDIA_NOT_OWNED`.
  - قبول منشور يحتوي على فيديو وصورة معاً (`400 INVALID_MEDIA_COMBINATION`).
  - قبول مفتاح غير موجود في Storage دون إرجاع `400 MEDIA_NOT_FOUND`.

#### 2.5 حزمة اختبارات المرحلة 2 (Vitest + Supertest)
الملف: `src/modules/media/__tests__/media.e2e.spec.ts`
```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createTestingApp, mockValidToken } from '../../../test/test-utils';
import { S3Service } from '../s3.service';

describe('Phase 2: Media Presign & Verification (E2E)', () => {
  let app: any;
  let s3Service: S3Service;

  beforeAll(async () => {
    app = await createTestingApp();
    s3Service = app.get(S3Service);
  });

  afterAll(async () => {
    await app.close();
  });

  // العملية الإيجابية: Presign لصورة صالحة
  it('[Positive] POST /media/presign returns presigned uploadUrl and key', async () => {
    const token = mockValidToken({ uid: 'user-media-1' });
    const res = await request(app.getHttpServer())
      .post('/media/presign')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: 1024 * 1024,
      });

    expect(res.status).toBe(200);
    expect(res.body.uploadUrl).toBeDefined();
    expect(res.body.key).toContain('media/');
    expect(res.body.method).toBe('PUT');
  });

  // العملية المضادة 1: طلب presign بحجم يتجاوز 5MB للصور
  it('[Negative] POST /media/presign with size > 5MB returns 400 VALIDATION_ERROR', async () => {
    const token = mockValidToken({ uid: 'user-media-1' });
    const res = await request(app.getHttpServer())
      .post('/media/presign')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'IMAGE',
        contentType: 'image/jpeg',
        sizeBytes: 6 * 1024 * 1024,
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  // العملية المضادة 2: استخدام مفتاح غير مملوك للمستخدم
  it('[Negative] Using another user key throws 403 MEDIA_NOT_OWNED', async () => {
    const mediaService = app.get('MediaService');
    await expect(
      mediaService.verifyMediaKeys('user-a', ['media/user-b/uuid.jpg'], 'POST'),
    ).rejects.toMatchObject({
      code: 'MEDIA_NOT_OWNED',
    });
  });
});
```

#### 2.6 أمر فحص الانحدار (Regression Check Command)
```bash
npx vitest run src/modules/health src/modules/auth src/modules/users src/modules/media
```

---

### المرحلة 3: المنشورات والملكية وحالات الحذف المؤقت (Posts CRUD & Soft State)

#### 3.1 الهدف والنطاق
- تنفيذ إنشاء المنشورات `POST /posts` بربط ذرّي مع وسائط `PostMedia`، والتحقق من عدم فراغ المنشور (`400 EMPTY_POST`).
- استرجاع منشور فردي `GET /posts/:id` كمسار عام لا يرجع إلا المنشور النشط صاحبه نشط (`post.status === 'ACTIVE' AND author.status === 'ACTIVE'`)، وغير ذلك `404`.
- تعديل المنشور `PATCH /posts/:id` للنص فقط ولصاحب المنشور حصراً، مع الترتيب الدقيق للقواعد (404 ثم 403 ثم 409 ثم 400).
- الحذف المؤقت `DELETE /posts/:id` بتعديل الحالة إلى `DELETED`.
- استعراض منشورات مستخدم `GET /users/:id/posts` مع إظهار المنشورات الـ `HIDDEN` لصاحب الحساب فقط.

#### 3.2 الشروط المسبقة (Prerequisites)
- اكتمال المراحل 0 و 1 و 2 بنجاح تام.

#### 3.3 الملفات وأوامر التنفيذ التفصيلية

##### أ) مسارات المنشورات `src/modules/posts/posts.controller.ts`:
```ts
import { Controller, Post, Get, Patch, Delete, Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public, OptionalAuth } from '../../common/decorators/auth-mode.decorator';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  async create(@CurrentUser('id') userId: string, @Body() dto: CreatePostDto) {
    return this.postsService.create(userId, dto);
  }

  @Get(':id')
  @Public()
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.postsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postsService.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser('id') userId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.postsService.remove(userId, id);
  }
}
```

##### ب) منطق المنشورات `src/modules/posts/posts.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { AppException } from '../../common/exceptions/app.exception';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService, private readonly mediaService: MediaService) {}

  async create(userId: string, dto: CreatePostDto) {
    const text = dto.text?.trim() ? dto.text.trim() : null;
    const keys = dto.mediaKeys ?? [];

    if (!text && keys.length === 0) {
      throw new AppException(400, 'EMPTY_POST', 'Post must contain text or at least one media item');
    }

    let verifiedMedia: { key: string; type: any; position: number }[] = [];
    if (keys.length > 0) {
      verifiedMedia = await this.mediaService.verifyMediaKeys(userId, keys, 'POST');
    }

    try {
      const post = await this.prisma.post.create({
        data: {
          authorId: userId,
          text,
          status: 'ACTIVE',
          media: {
            create: verifiedMedia.map((m) => ({
              key: m.key,
              type: m.type,
              position: m.position,
            })),
          },
        },
        include: {
          media: { orderBy: { position: 'asc' } },
          author: { select: { id: true, displayName: true, avatarKey: true } },
        },
      });
      return this.toPostDto(post);
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new AppException(409, 'MEDIA_ALREADY_USED', 'Media key is already in use');
      }
      throw e;
    }
  }

  async findOne(id: string) {
    const post = await this.prisma.post.findFirst({
      where: {
        id,
        status: 'ACTIVE',
        author: { status: 'ACTIVE' },
      },
      include: {
        media: { orderBy: { position: 'asc' } },
        author: { select: { id: true, displayName: true, avatarKey: true } },
      },
    });

    if (!post) {
      throw new AppException(404, 'POST_NOT_FOUND', 'Post not found');
    }
    return this.toPostDto(post);
  }

  async update(userId: string, id: string, dto: UpdatePostDto) {
    // 1) Post status check
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { media: true },
    });

    if (!post || post.status === 'DELETED' || (post.status === 'HIDDEN' && post.authorId !== userId)) {
      throw new AppException(404, 'POST_NOT_FOUND', 'Post not found');
    }

    // 2) Ownership
    if (post.authorId !== userId) {
      throw new AppException(403, 'NOT_POST_OWNER', 'You can only modify your own posts');
    }

    // 3) Hidden post cannot be edited
    if (post.status === 'HIDDEN') {
      throw new AppException(409, 'POST_NOT_EDITABLE', 'Hidden posts cannot be edited');
    }

    // 4) Empty post check
    const newText = dto.text?.trim() ? dto.text.trim() : null;
    if (!newText && post.media.length === 0) {
      throw new AppException(400, 'EMPTY_POST', 'Post must contain text or at least one media item');
    }

    const updated = await this.prisma.post.update({
      where: { id },
      data: { text: newText },
      include: {
        media: { orderBy: { position: 'asc' } },
        author: { select: { id: true, displayName: true, avatarKey: true } },
      },
    });

    return this.toPostDto(updated);
  }

  async remove(userId: string, id: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post || post.status === 'DELETED' || (post.status === 'HIDDEN' && post.authorId !== userId)) {
      throw new AppException(404, 'POST_NOT_FOUND', 'Post not found');
    }

    if (post.authorId !== userId) {
      throw new AppException(403, 'NOT_POST_OWNER', 'You can only modify your own posts');
    }

    await this.prisma.post.update({
      where: { id },
      data: { status: 'DELETED' },
    });
  }

  private toPostDto(post: any) {
    return {
      id: post.id,
      text: post.text,
      media: post.media.map((m: any) => ({
        url: `${process.env.MEDIA_PUBLIC_BASE_URL}/${m.key}`,
        type: m.type,
        position: m.position,
      })),
      status: post.status,
      author: {
        id: post.author.id,
        displayName: post.author.displayName,
        avatarUrl: post.author.avatarKey ? `${process.env.MEDIA_PUBLIC_BASE_URL}/${post.author.avatarKey}` : null,
      },
      createdAt: post.createdAt.toISOString(),
    };
  }
}
```

#### 3.4 معايير القبول والرفض (Acceptance & Rejection Criteria)
- **معيار القبول (Pass):**
  - إنشاء منشور بنص وميديا بنجاح، وتعديله وحذفه من قِبل صاحبه فقط.
  - إرجاع `404` عند طلب منشور مخفي أو محذوف عبر `GET /posts/:id`.
  - حذف منشور مؤقتاً يجعل حالته `DELETED` في الداتابيز دون مسح صفه.
- **معيار الرفض (Fail):**
  - تمكين مستخدم من تعديل أو حذف منشور مستخدم آخر (يجب إرجاع `403 NOT_POST_OWNER`).
  - السماح بتعديل منشور حالته `HIDDEN` (يجب إرجاع `409 POST_NOT_EDITABLE`).
  - السماح بإنشاء منشور بدون نص وبدون ميديا (`400 EMPTY_POST`).

#### 3.5 حزمة اختبارات المرحلة 3 (Vitest + Supertest)
الملف: `src/modules/posts/__tests__/posts.e2e.spec.ts`
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestingApp, mockValidToken } from '../../../test/test-utils';

describe('Phase 3: Posts CRUD & Soft Delete (E2E)', () => {
  let app: any;
  let authorToken: string;
  let strangerToken: string;
  let createdPostId: string;

  beforeAll(async () => {
    app = await createTestingApp();
    authorToken = mockValidToken({ uid: 'post-author-1' });
    strangerToken = mockValidToken({ uid: 'post-stranger-1' });
  });

  afterAll(async () => {
    await app.close();
  });

  // العملية الإيجابية 1: إنشاء منشور
  it('[Positive] POST /posts creates an active post with text', async () => {
    const res = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ text: 'Hello Ummah World' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.text).toBe('Hello Ummah World');
    expect(res.body.status).toBe('ACTIVE');
    createdPostId = res.body.id;
  });

  // العملية الإيجابية 2: تعديل المنشور من صاحبه
  it('[Positive] PATCH /posts/:id updates text by owner', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/posts/${createdPostId}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ text: 'Hello Ummah World (Edited)' });

    expect(res.status).toBe(200);
    expect(res.body.text).toBe('Hello Ummah World (Edited)');
  });

  // العملية المضادة 1: محاولة تعديل المنشور من غريب
  it('[Negative] PATCH /posts/:id by non-owner returns 403 NOT_POST_OWNER', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/posts/${createdPostId}`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ text: 'Hacked Text' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_POST_OWNER');
  });

  // العملية المضادة 2: محاولة إنشاء منشور فارغ
  it('[Negative] POST /posts without text and media returns 400 EMPTY_POST', async () => {
    const res = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ text: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMPTY_POST');
  });

  // العملية الإيجابية 3: حذف المنشور (Soft Delete)
  it('[Positive] DELETE /posts/:id performs soft delete', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/posts/${createdPostId}`)
      .set('Authorization', `Bearer ${authorToken}`);

    expect(res.status).toBe(204);

    // التحقق من أن المنشور أصبح يرجع 404
    const getRes = await request(app.getHttpServer()).get(`/posts/${createdPostId}`);
    expect(getRes.status).toBe(404);
  });
});
```

#### 3.6 أمر فحص الانحدار (Regression Check Command)
```bash
npx vitest run src/modules/health src/modules/auth src/modules/users src/modules/media src/modules/posts
```

---

### المرحلة 4: الـ Feed العام والتصفح بالـ Cursor (Feed & Deterministic Pagination)

#### 4.1 الهدف والنطاق
- تنفيذ `GET /feed` كمسار عام بدون توكن (`@Public()`).
- الترتيب الزمني الصارم بالأحدث: `createdAt DESC, id DESC`.
- استخدام الـ Helper الموحد `visiblePostWhere` لتصفية المنشورات (`post.status === 'ACTIVE' AND author.status === 'ACTIVE'`).
- تطبيق التصفح بالـ Cursor بنمط `base64url({ c: createdAt, i: id })` بدقة الميلي ثانية لمنع انزياح النتائج عند نشر محتوى جديد.

#### 4.2 الشروط المسبقة (Prerequisites)
- اكتمال المراحل 0 إلى 3 بنجاح وتوافر بيانات منشورات لاختبار التصفح.

#### 4.3 الملفات وأوامر التنفيذ التفصيلية

##### أ) مساعدات الـ Cursor والفلترة `src/common/utils/cursor.util.ts`:
```ts
import { AppException } from '../exceptions/app.exception';

export interface CursorPayload {
  c: string; // ISO date
  i: string; // UUID
}

export function encodeCursor(createdAt: Date, id: string): string {
  const payload: CursorPayload = { c: createdAt.toISOString(), i: id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    const date = new Date(parsed.c);
    if (isNaN(date.getTime()) || typeof parsed.i !== 'string' || parsed.i.length === 0) {
      throw new Error();
    }
    return { createdAt: date, id: parsed.i };
  } catch {
    throw new AppException(400, 'INVALID_CURSOR', 'Invalid cursor');
  }
}
```

##### ب) مسار ومنطق الـ Feed `src/modules/feed/feed.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationQueryDto } from '../posts/dto/pagination-query.dto';
import { decodeCursor, encodeCursor } from '../../common/utils/cursor.util';
import { visiblePostWhere } from '../../common/utils/status-filters';

@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  async getFeed(query: PaginationQueryDto) {
    const limit = query.limit ?? 20;
    const c = query.cursor ? decodeCursor(query.cursor) : null;

    const rows = await this.prisma.post.findMany({
      where: {
        AND: [
          visiblePostWhere(),
          ...(c
            ? [
                {
                  OR: [
                    { createdAt: { lt: c.createdAt } },
                    { createdAt: c.createdAt, id: { lt: c.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        media: { orderBy: { position: 'asc' } },
        author: { select: { id: true, displayName: true, avatarKey: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];

    return {
      items: items.map((post) => ({
        id: post.id,
        text: post.text,
        media: post.media.map((m) => ({
          url: `${process.env.MEDIA_PUBLIC_BASE_URL}/${m.key}`,
          type: m.type,
          position: m.position,
        })),
        status: post.status,
        author: {
          id: post.author.id,
          displayName: post.author.displayName,
          avatarUrl: post.author.avatarKey ? `${process.env.MEDIA_PUBLIC_BASE_URL}/${post.author.avatarKey}` : null,
        },
        createdAt: post.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? encodeCursor(last.createdAt, last.id) : null,
    };
  }
}
```

#### 4.4 معايير القبول والرفض (Acceptance & Rejection Criteria)
- **معيار القبول (Pass):**
  - استدعاء `GET /feed` بدون توكن يرجع قائمة منشورات مرتبة تنازلياً مع `nextCursor` صالح.
  - تمرير `nextCursor` المستلم يجلب الصفحة التالية مباشرة دون تكرار أي عنصر.
- **معيار الرفض (Fail):**
  - تسرب أي منشور بحالة `HIDDEN` أو `DELETED` أو منشور لكاتب `SUSPENDED` داخل الـ Feed.
  - إرسال كورسور تالف أو عشوائي دون إرجاع `400 INVALID_CURSOR`.

#### 4.5 حزمة اختبارات المرحلة 4 (Vitest + Supertest)
الملف: `src/modules/feed/__tests__/feed.e2e.spec.ts`
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestingApp, seedTestPosts } from '../../../test/test-utils';

describe('Phase 4: Chronological Feed & Cursor Pagination (E2E)', () => {
  let app: any;

  beforeAll(async () => {
    app = await createTestingApp();
    await seedTestPosts(app, 25); // زرع 25 منشور تجريبي
  });

  afterAll(async () => {
    await app.close();
  });

  // العملية الإيجابية: تصفح الصفحة الأولى والصفحة الثانية
  it('[Positive] GET /feed returns first 10 items and valid nextCursor', async () => {
    const res = await request(app.getHttpServer()).get('/feed?limit=10');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(10);
    expect(res.body.nextCursor).toBeDefined();

    // جلب الصفحة الثانية
    const resPage2 = await request(app.getHttpServer()).get(`/feed?limit=10&cursor=${res.body.nextCursor}`);
    expect(resPage2.status).toBe(200);
    expect(resPage2.body.items.length).toBe(10);
    expect(resPage2.body.items[0].id).not.toBe(res.body.items[0].id);
  });

  // العملية المضادة 1: إرسال كورسور غير صالح
  it('[Negative] GET /feed with malformed cursor returns 400 INVALID_CURSOR', async () => {
    const res = await request(app.getHttpServer()).get('/feed?cursor=malformed_base64_string');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CURSOR');
  });

  // العملية المضادة 2: تجاوز الحد الأقصى للـ limit (أكثر من 50)
  it('[Negative] GET /feed with limit=100 returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer()).get('/feed?limit=100');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
```

#### 4.6 أمر فحص الانحدار (Regression Check Command)
```bash
npx vitest run src/modules/health src/modules/auth src/modules/users src/modules/media src/modules/posts src/modules/feed
```

---

### المرحلة 5: نظام الإبلاغ والرقابة التلقائية والتزامن (Atomic Moderation Transaction)

#### 5.1 الهدف والنطاق
- تنفيذ مسار الإبلاغ `POST /posts/:id/report` للمستخدمين المسجلين فقط (مع Rate limit صلب 5/دقيقة).
- إدارة البلاغ داخل Atomic Transaction واحدة بقفل الصفوف (Post ثم User لمنع Deadlocks):
  - التحقق من أن المنشور وكاتبه نشطان (`ACTIVE`)، وإلا يرجع `404 POST_NOT_FOUND`.
  - منع الكاتب من الإبلاغ عن منشوره (`403 CANNOT_REPORT_OWN_POST`).
  - تسجيل البلاغ مع ضمان عدم التكرار (`UNIQUE(postId, reporterId)` يرجع `409 ALREADY_REPORTED`).
  - زيادة عداد المنشور ذرياً: عند بلوغ `7` بلاغات يتحول المنشور فوراً إلى `HIDDEN`.
  - زيادة عداد المستخدم ذرياً: عند بلوغ `15` بلاغاً يتحول حسابه فوراً إلى `SUSPENDED`.
- التأكد من الأثر اللحظي لعزل المحتوى والحسابات المخالفة عن النظام بالكامل.

#### 5.2 الشروط المسبقة (Prerequisites)
- اكتمال كافة المراحل السابقة (0 إلى 4).

#### 5.3 الملفات وأوامر التنفيذ التفصيلية

##### أ) منطق الـ Transaction الذري `src/modules/reports/reports.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportReason } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async reportPost(reporterId: string, postId: string, reason: ReportReason) {
    return this.prisma.$transaction(
      async (tx) => {
        // Step 0: التأكد من وجود وظهور المنشور
        const post = await tx.post.findFirst({
          where: { id: postId, status: 'ACTIVE', author: { status: 'ACTIVE' } },
          select: { id: true, authorId: true },
        });
        if (!post) {
          throw new AppException(404, 'POST_NOT_FOUND', 'Post not found');
        }

        // Step 1: منع الإبلاغ عن المنشور الذاتي
        if (post.authorId === reporterId) {
          throw new AppException(403, 'CANNOT_REPORT_OWN_POST', 'You cannot report your own post');
        }

        // Step 2: تسجيل البلاغ (Unique constraint)
        let report;
        try {
          report = await tx.report.create({
            data: { postId, reporterId, reason },
          });
        } catch (e: any) {
          if (e.code === 'P2002') {
            throw new AppException(409, 'ALREADY_REPORTED', 'You have already reported this post');
          }
          throw e;
        }

        // Step 3: Increment ذري لعداد المنشور
        const { reportCount: postCount } = await tx.post.update({
          where: { id: postId },
          data: { reportCount: { increment: 1 } },
          select: { reportCount: true },
        });

        // Step 4: فحص عتبة إخفاء المنشور (7 بلاغات)
        const postThreshold = Number(process.env.POST_REPORT_THRESHOLD) || 7;
        if (postCount >= postThreshold) {
          await tx.post.updateMany({
            where: { id: postId, status: 'ACTIVE' },
            data: { status: 'HIDDEN' },
          });
        }

        // Step 5: Increment ذري لعداد الكاتب
        const { reportCount: userCount } = await tx.user.update({
          where: { id: post.authorId },
          data: { reportCount: { increment: 1 } },
          select: { reportCount: true },
        });

        // Step 6: فحص عتبة تعليق الكاتب (15 بلاغ)
        const userThreshold = Number(process.env.USER_REPORT_THRESHOLD) || 15;
        if (userCount >= userThreshold) {
          await tx.user.updateMany({
            where: { id: post.authorId, status: 'ACTIVE' },
            data: { status: 'SUSPENDED' },
          });
        }

        return {
          id: report.id,
          postId,
          reason: report.reason,
          createdAt: report.createdAt.toISOString(),
        };
      },
      { maxWait: 5000, timeout: 10000 },
    );
  }
}
```

#### 5.4 معايير القبول والرفض (Acceptance & Rejection Criteria)
- **معيار القبول (Pass):**
  - وصول بلاغ للمنشور يرفع عداد المنشور والكاتب بمقدار 1.
  - البلاغ رقم 7 يحول المنشور تلقائياً إلى `HIDDEN` ويختفي فوراً من `GET /feed` و `GET /posts/:id`.
  - البلاغ رقم 15 يحول كاتب المنشور إلى `SUSPENDED` ويمنع توكنه فوراً بـ `403 ACCOUNT_SUSPENDED`.
- **معيار الرفض (Fail):**
  - سماح الكاتب بالإبلاغ عن منشوره (`403 CANNOT_REPORT_OWN_POST`).
  - السماح للمستخدم بتكرار البلاغ لنفس المنشور (`409 ALREADY_REPORTED`).
  - إمكانية الإبلاغ عن منشور مخفي أو محذوف (`404 POST_NOT_FOUND`).

#### 5.5 حزمة اختبارات المرحلة 5 (Vitest + Supertest)
الملف: `src/modules/reports/__tests__/reports.e2e.spec.ts`
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestingApp, mockValidToken, createTestPost } from '../../../test/test-utils';

describe('Phase 5: Moderation, Reports & Thresholds (E2E)', () => {
  let app: any;
  let authorToken: string;
  let reporterToken1: string;
  let targetPost: any;

  beforeAll(async () => {
    app = await createTestingApp();
    authorToken = mockValidToken({ uid: 'author-target-1' });
    reporterToken1 = mockValidToken({ uid: 'reporter-1' });
    targetPost = await createTestPost(app, authorToken, 'Post to be reported');
  });

  afterAll(async () => {
    await app.close();
  });

  // العملية الإيجابية: إرسال بلاغ سليم
  it('[Positive] POST /posts/:id/report registers report successfully', async () => {
    const res = await request(app.getHttpServer())
      .post(`/posts/${targetPost.id}/report`)
      .set('Authorization', `Bearer ${reporterToken1}`)
      .send({ reason: 'SPAM' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.reason).toBe('SPAM');
  });

  // العملية المضادة 1: الإبلاغ عن المنشور الذاتي
  it('[Negative] Reporting own post returns 403 CANNOT_REPORT_OWN_POST', async () => {
    const res = await request(app.getHttpServer())
      .post(`/posts/${targetPost.id}/report`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ reason: 'SPAM' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CANNOT_REPORT_OWN_POST');
  });

  // العملية المضادة 2: تكرار البلاغ من نفس المستخدم
  it('[Negative] Reporting same post twice returns 409 ALREADY_REPORTED', async () => {
    const res = await request(app.getHttpServer())
      .post(`/posts/${targetPost.id}/report`)
      .set('Authorization', `Bearer ${reporterToken1}`)
      .send({ reason: 'SPAM' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_REPORTED');
  });

  // العملية الإيجابية 2: وصول 7 بلاغات يخفي المنشور تلقائياً
  it('[Positive] 7th report automatically sets post status to HIDDEN', async () => {
    for (let i = 2; i <= 7; i++) {
      const token = mockValidToken({ uid: `reporter-${i}` });
      await request(app.getHttpServer())
        .post(`/posts/${targetPost.id}/report`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'VIOLENCE' });
    }

    // المنشور الآن HIDDEN ويجب أن يرجع 404
    const getRes = await request(app.getHttpServer()).get(`/posts/${targetPost.id}`);
    expect(getRes.status).toBe(404);
  });
});
```

#### 5.6 أمر فحص الانحدار (Regression Check Command)
```bash
npx vitest run src/modules/health src/modules/auth src/modules/users src/modules/media src/modules/posts src/modules/feed src/modules/reports
```

---

### المرحلة 6: الحماية ومعدل الطلبات ودليل التشغيل (Throttling, Security & Ops Runbook)

#### 6.1 الهدف والنطاق
- تفعيل معدل الطلبات `@nestjs/throttler` (العام 100/د، الميديا 20/د، البلاغات 5/د، والصحة مستثنى `@SkipThrottle()`).
- تأمين السيرفر بـ `helmet()` وضبط CORS الصارم بقائمة بيضاء (`CORS_ORIGINS`) وتحديد حجم الـ JSON إلى 100kb.
- تفعيل وثائق Swagger خارج بيئة الإنتاج (`addBearerAuth()`).
- تجهيز استعلامات وسكربتات دليل التشغيل اليدوي (Runbook SQL Queries) لفك القفل واسترجاع المحتوى.

#### 6.2 الشروط المسبقة (Prerequisites)
- اكتمال المراحل 0 إلى 5 مع اجتياز كامل الاختبارات.

#### 6.3 الملفات وأوامر التنفيذ التفصيلية

##### أ) إعداد الحماية في `src/main.ts`:
```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { json } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/exceptions/all-exceptions.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1) Security Headers
  app.use(helmet());

  // 2) Body Limit
  app.use(json({ limit: '100kb' }));

  // 3) CORS
  const origins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim());
  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });

  // 4) Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 5) Global Exception Filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // 6) Swagger (non-production)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Ummah Backend API')
      .setDescription('Ummah Social Media Platform V1 API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  // 7) Graceful Shutdown
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
}
bootstrap();
```

##### ب) استعلامات الـ Runbook اليدوية المعتمدة:
1. **استرجاع منشور مخفي (`HIDDEN` -> `ACTIVE`):**
```sql
BEGIN;
WITH p AS (
  SELECT id, "authorId", "reportCount" FROM posts
  WHERE id = '<POST_UUID>' AND status = 'HIDDEN' FOR UPDATE
), u AS (
  UPDATE users SET "reportCount" = GREATEST(0, users."reportCount" - p."reportCount"), "updatedAt" = now()
  FROM p WHERE users.id = p."authorId"
  RETURNING users.id
)
UPDATE posts SET status = 'ACTIVE', "reportCount" = 0, "updatedAt" = now()
WHERE id IN (SELECT id FROM p)
RETURNING id, status, "reportCount";
COMMIT;
```

2. **فك قفل حساب معلق (`SUSPENDED` -> `ACTIVE`):**
```sql
UPDATE users SET status = 'ACTIVE', "reportCount" = 0, "updatedAt" = now()
WHERE id = '<USER_UUID>' AND status = 'SUSPENDED'
RETURNING id, "displayName", status, "reportCount";
```

#### 6.4 معايير القبول والرفض (Acceptance & Rejection Criteria)
- **معيار القبول (Pass):**
  - تجاوز حد 5 بلاغات في الدقيقة أو 20 presign يرجع كود `429 TOO_MANY_REQUESTS`.
  - إرسال Payload أكبر من 100kb يرفض فورا بـ `413 Payload Too Large`.
  - استعلامات الـ Runbook تعيد المنشور والكاتب للحالة النشطة مع تصفير العداد بضمان ذري.
- **معيار الرفض (Fail):**
  - عمل Swagger داخل بيئة الإنتاج `NODE_ENV=production`.
  - السماح بـ CORS من مصادر غير معرّفة في القائمة البيضاء (`CORS_ORIGINS`).

#### 6.5 حزمة اختبارات المرحلة 6 (Vitest + Supertest)
الملف: `src/modules/reports/__tests__/throttler.e2e.spec.ts`
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestingApp, mockValidToken } from '../../../test/test-utils';

describe('Phase 6: Throttling & Security Limits (E2E)', () => {
  let app: any;

  beforeAll(async () => {
    app = await createTestingApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // العملية المضادة: تجاوز معدل الطلبات للتقارير (أكثر من 5 في الدقيقة)
  it('[Negative] Exceeding report throttle limit returns 429 TOO_MANY_REQUESTS', async () => {
    const token = mockValidToken({ uid: 'spammer-1' });
    const dummyPostId = '00000000-0000-0000-0000-000000000001';

    let lastStatus = 200;
    for (let i = 0; i < 7; i++) {
      const res = await request(app.getHttpServer())
        .post(`/posts/${dummyPostId}/report`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'SPAM' });
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });
});
```

---

## 4. قائمة فحص الانحدار الإجمالية (Full Regression Test Suite)

عند الانتهاء من جميع المراحل أو عند تعديل أي ملف في المشروع، يجب تشغيل أمر الاختبار الشامل بالكامل والتأكد من ظهور اللون الأخضر لجميع الوحدات بنسبة 100%:

```bash
npx vitest run
```

### معيار الجاهزية للتسليم (Definition of Done)
1. **جميع الاختبارات الإيجابية (Happy Paths) تنجح.**
2. **جميع الاختبارات العكسية والمضادة (Edge Cases & Rejections) تنجح.**
3. **لا وجود لأي ميزة خارج نطاق V1.**
4. **التطبيق يقلع بنجاح ويرتبط بقاعدة البيانات بدون أي أخطاء من النوع Strict في TypeScript.**
