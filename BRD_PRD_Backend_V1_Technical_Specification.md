# BRD / PRD — Backend V1 (Technical Specification)

مواصفات فنية تنفيذية مشتقة من «توثيق الـBackend — النسخة الأولى (V1)». كل بند هنا مُلزِم للتنفيذ حرفيًا، وأي سلوك غير مذكور فهو خارج النطاق. المواصفات والأكواد وأسماء الحقول بالإنجليزية، والشرح والسياق بالعربية.

## 1. Executive Summary & Scope Boundaries

### 1.1 Project Vision & MVP Philosophy

هدف النسخة الأولى هو إطلاق Backend صغير وسليم يدعم: تسجيل الدخول، وتصفح المحتوى كزائر بدون حساب، ونشر (نص / صور / فيديو)، وfeed عام مرتب زمنيًا من الأحدث للأقدم، وتعديل الملف الشخصي والمنشورات، والإبلاغ عن المنشورات المخالفة مع إخفاء وقفل تلقائي حسب حدود محددة. فلسفة الـMVP: نطاق ضيق، وكل نسخة لاحقة تضيف خصائص صغيرة فقط، ولا يُضاف أي شيء خارج هذا المستند.

### 1.2 In-Scope Features Matrix

| ID | Feature | Access | Module |
| --- | --- | --- | --- |
| F-01 | Authentication via Firebase ID Token + auto-provisioning of the user on first valid request | Mandatory Auth | auth |
| F-02 | Guest browsing: feed, single post, public profile, user posts | Public / Optional Auth | feed, posts, users |
| F-03 | Posts with text, images, video (create / edit text / soft delete) | Mandatory Auth | posts, media |
| F-04 | Public chronological feed (newest first, cursor pagination) | Public | feed |
| F-05 | View and edit own profile (displayName, bio, avatar) | Public (view) / Mandatory (edit) | users |
| F-06 | Report a post | Mandatory Auth | reports |
| F-07 | Auto-moderation: 7 reports hide a post, 15 reports suspend its author | System | reports |
| F-08 | Manual moderation directly from the database (Runbook, Section 7) | Ops | — |
| F-09 | Health check | Public | health |

### 1.3 Out-of-Scope (Hard Boundaries)

محظور تنفيذ أي مما يلي في V1: Likes، Comments، Follows، Notifications (push أو غيرها)، Search، لوحة Admin، Video transcoding / thumbnails، Background queues / workers، External cache (Redis وغيره)، Microservices، رسائل خاصة، حظر المستخدمين لبعضهم، مصادقة بالإيميل والباسورد من الـBackend نفسه.

### 1.4 Core Architectural Principles

| # | Principle | Enforceable Rule |
| --- | --- | --- |
| P1 | Modular Monolith | تطبيق NestJS واحد وdeployable واحد، مقسم Feature Modules. لا queues ولا cache ولا services منفصلة. |
| P2 | DB as Source of Truth | حالة المستخدم والمنشور والعدادات تُقرأ من PostgreSQL فقط. لا يُعتمد على Firebase token في معرفة حالة الحساب. |
| P3 | Soft State | لا حذف فعلي من كود التطبيق. الحذف والإخفاء والقفل كلها عبر الحقل `status`، والمراجعة اليدوية تعيدها بتغيير `status`. |
| P4 | Direct Upload | السيرفر لا يستلم ملفات أبدًا. يصدر Presigned URL فقط ويتحقق لاحقًا بـ`HEAD`. |
| P5 | Secure by Default | `AuthGuard` عام (APP\_GUARD)، وأي endpoint بلا decorator صريح (`@Public()` أو `@OptionalAuth()`) يكون Mandatory Auth. |
| P6 | Query-Layer Filtering | فلاتر `status` موجودة في طبقة الـservice / repository عبر helper موحد، وليست في الـcontrollers. |

### 1.5 Locked Defaults (Source Open Points)

القيم التالية كانت نقاطًا مفتوحة في المستند المصدر، وتم تثبيتها كقيم افتراضية قابلة للتعديل من الـconfig فقط بدون تغيير كود. تُراجَع مع المهندس قبل الإنتاج.

| Key | Default | Env Var |
| --- | --- | --- |
| Post text max length | 2000 chars | POST\_TEXT\_MAX |
| Media per post | up to 4 images OR exactly 1 video (no mixing) | MEDIA\_MAX\_PER\_POST=4 |
| Image | ≤ 5 MB (5242880 bytes); jpeg, png, webp | IMAGE\_MAX\_BYTES |
| Video | ≤ 50 MB (52428800 bytes) and ≤ 60 s; mp4, quicktime | VIDEO\_MAX\_BYTES, VIDEO\_MAX\_SECONDS |
| Presigned URL expiry | 300 s | PRESIGN\_EXPIRES\_SECONDS |
| Feed page size | default 20, max 50 | — |
| displayName / bio | 1–50 / 0–160 chars | — |
| Post report threshold | 7 | POST\_REPORT\_THRESHOLD |
| User report threshold | 15 | USER\_REPORT\_THRESHOLD |
| User report count definition | يزيد بمقدار 1 عند كل بلاغ على أي منشور للمستخدم (مجموع بلاغات منشوراته) | — |
| Throttle | global 100/min، reports 5/min، media presign 20/min (لأن المنشور قد يحتاج حتى 4 presigns) | THROTTLE\_\* |
| Editable post fields | `text` فقط. الميديا غير قابلة للتعديل في V1. | — |
| Report reasons | RELIGIOUS\_VIOLATION, VIOLENCE, SPAM, OTHER | — |

## 2. System Architecture & Technical Stack

### 2.1 Tech Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime & Framework | NestJS (TypeScript, strict mode) | Modular Monolith |
| ORM & Database | PostgreSQL + Prisma | Migrations only: `prisma migrate dev` محليًا و`prisma migrate deploy` في البيئات. ممنوع `db push` خارج الـlocal. |
| Auth Provider | Firebase Auth via `firebase-admin` | الـBackend يتحقق من الـID Token فقط |
| Media Storage | S3-compatible (Cloudflare R2) via presigned URLs | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` |
| Validation | `class-validator` + `class-transformer` | Global `ValidationPipe` |
| Rate Limiting | `@nestjs/throttler` | In-memory (instance واحد في V1) |
| Config | `@nestjs/config` + schema validation (Joi أو zod) | فشل الإقلاع لو متغير ناقص |
| Security | `helmet`, CORS whitelist |  |
| API Docs | `@nestjs/swagger` | مفعّل خارج production |
| Logging | `nestjs-pino` (JSON) | request id، وredaction للـAuthorization |

### 2.2 Module Layout

```text
src/
  main.ts
  app.module.ts
  config/            # env schema + typed config
  common/            # AuthGuard, decorators (@Public, @OptionalAuth, @CurrentUser),
                     # AllExceptionsFilter, AppException, pagination/cursor utils, status filters
  prisma/            # PrismaService
  auth/              # Firebase verification, provisioning, GET /auth/me
  users/             # profile endpoints
  media/             # presign + S3 HEAD verification
  posts/             # CRUD
  feed/              # GET /feed
  reports/           # report creation + moderation transaction
  health/            # GET /health
```

### 2.3 Environment Variables

`NODE_ENV`, `PORT`, `DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `MEDIA_PUBLIC_BASE_URL` (بدون slash في النهاية)، `CORS_ORIGINS` (قائمة مفصولة بفواصل)، بالإضافة لمتغيرات القيم في القسم 1.5. لا يوجد أي secret داخل الـrepo.

### 2.4 Authentication & Authorization Flow

كل route له واحد من 3 أوضاع: `PUBLIC` أو `OPTIONAL` أو `MANDATORY` (الافتراضي).

```text
Request -> ThrottlerGuard -> AuthGuard(global) -> ValidationPipe -> Controller -> Service -> Prisma
```

```ts
async canActivate(ctx: ExecutionContext): Promise<boolean> {
  const mode = this.reflector.get<AuthMode>(AUTH_MODE, ctx.getHandler()) ?? 'MANDATORY';
  const req = ctx.switchToHttp().getRequest();

  // 1) Guest mode: the token (if any) is ignored on PUBLIC routes.
  if (mode === 'PUBLIC') { req.user = null; return true; }

  const token = extractBearer(req.headers.authorization); // null when header is absent
  if (!token) {
    if (mode === 'OPTIONAL') { req.user = null; return true; }
    throw new AppException(401, 'UNAUTHENTICATED', 'Missing bearer token');
  }

  // 2) Verify Firebase ID Token. A present-but-invalid token is NEVER downgraded to guest.
  let decoded: DecodedIdToken;
  try { decoded = await firebaseAuth.verifyIdToken(token); }
  catch { throw new AppException(401, 'INVALID_TOKEN', 'Invalid or expired token'); }

  // 3) Auto-provision (upsert on firebaseUid). Retry once on a concurrent-create race.
  const data = { firebaseUid: decoded.uid, displayName: deriveDisplayName(decoded) };
  let user;
  try {
    user = await prisma.user.upsert({ where: { firebaseUid: decoded.uid }, update: {}, create: data });
  } catch (e) {
    if (isPrismaError(e, 'P2002')) user = await prisma.user.findUniqueOrThrow({ where: { firebaseUid: decoded.uid } });
    else throw e;
  }

  // 4) Status enforcement from the DB on EVERY request.
  if (user.status === 'SUSPENDED') throw new AppException(403, 'ACCOUNT_SUSPENDED', 'Account is suspended');

  req.user = { id: user.id, firebaseUid: user.firebaseUid };
  return true;
}

// displayName = decoded.name (trimmed, max 50) || local-part of decoded.email (max 50) || 'User'
```

ملاحظات: (1) المستخدم المقفول يستطيع تصفح الـendpoints الـPUBLIC كزائر لأن الـtoken لا يُقرأ فيها. (2) الـtoken صالح تقريبًا ساعة، ولذلك الاعتماد على فحص `status` من الـDB في كل طلب وليس على الـtoken. (3) لا يتم استدعاء `checkRevoked` في V1.

## 3. Production-Ready Database Schema (Prisma)

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

**ملاحظات تنفيذية:** (1) `onDelete: Restrict` على المستخدمين لأن التطبيق لا يحذف مستخدمين. (2) `Cascade` على الميديا والبلاغات يُستخدم فقط في الحذف النهائي اليدوي (Section 7). (3) `PostMedia.key` فريد لمنع إعادة استخدام نفس الملف في أكثر من منشور. (4) كل الأعمدة camelCase، وأسماء الجداول snake\_case عبر `@@map`.

## 4. Detailed API Specifications (OpenAPI/Swagger Style)

لا يوجد global prefix: المسارات أدناه هي المسارات الفعلية. كل الأوقات بصيغة ISO 8601 (UTC). كل الـIDs من نوع UUID. أي Route غير معرّف هنا يرجع `404 NOT_FOUND`.

### 4.0 Conventions, Shared Types & Error Catalogue

**جدول الـRoutes ومستوى الصلاحية:**

| # | Method + Path | Auth Level | Throttle |
| --- | --- | --- | --- |
| 1 | `GET /health` | Public | Skipped |
| 2 | `GET /auth/me` | Mandatory Auth | Global |
| 3 | `PATCH /users/me` | Mandatory Auth | Global |
| 4 | `GET /users/:id` | Public | Global |
| 5 | `GET /users/:id/posts` | Optional Auth | Global |
| 6 | `POST /media/presign` | Mandatory Auth | 20/min |
| 7 | `POST /posts` | Mandatory Auth | Global |
| 8 | `GET /posts/:id` | Public | Global |
| 9 | `PATCH /posts/:id` | Mandatory Auth (owner) | Global |
| 10 | `DELETE /posts/:id` | Mandatory Auth (owner) | Global |
| 11 | `GET /feed` | Public | Global |
| 12 | `POST /posts/:id/report` | Mandatory Auth | 5/min |

**قرار تثبيت (لأن المصدر قال «الـtoken اختياري» بدون تحديد):** الـendpoints التي لا تحتاج هوية الزائر (`feed`, `posts/:id`, `users/:id`, `health`) تكون `@Public()` فيتم تجاهل الـtoken فيها، فيستطيع المستخدم المقفول تصفحها كزائر (كما في Section 2.4). الـendpoint الوحيد الذي يحتاج معرفة الطالب لعرض منشورات `HIDDEN` لصاحبها هو `GET /users/:id/posts` فيكون `@OptionalAuth()`: إذا وُجد token صالح يُطبَّق عليه فحص `status` (المقفول يأخذ 403)، وإذا كان token غير صالح يأخذ 401 ولا يُعامل كزائر.

**Shared Response Types:**

```ts
interface UserPublicDto {
  id: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;   // `${MEDIA_PUBLIC_BASE_URL}/${avatarKey}` أو null
  createdAt: string;
}

interface UserMeDto extends UserPublicDto {
  status: 'ACTIVE';           // المقفول لا يصل لهذا الـendpoint أصلًا
}

interface MediaDto {
  url: string;                // `${MEDIA_PUBLIC_BASE_URL}/${key}`
  type: 'IMAGE' | 'VIDEO';
  position: number;           // يبدأ من 0
}

interface PostDto {
  id: string;
  text: string | null;
  media: MediaDto[];          // مرتبة بـposition ASC
  status: 'ACTIVE' | 'HIDDEN'; // HIDDEN يظهر فقط لصاحب المنشور في GET /users/:id/posts
  author: { id: string; displayName: string; avatarUrl: string | null };
  createdAt: string;
}

interface Page<T> { items: T[]; nextCursor: string | null; }
```

**قواعد العرض:** لا يُرجَع أبدًا `firebaseUid` ولا `reportCount` ولا `updatedAt` (لأن `updatedAt` يتغير مع كل بلاغ فيكشف نشاط الإبلاغ).

**Global Validation:** `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` مع `exceptionFactory` يحوّل الأخطاء إلى `400 VALIDATION_ERROR` برسالة واحدة تجمع رسائل الـclass-validator بالفاصل `; `. حقل غير معرّف في الـbody يُرفض (400).

**Error Response Shape (موحّد لكل الـendpoints):**

```json
{ "statusCode": 404, "code": "POST_NOT_FOUND", "message": "Post not found" }
```

**Error Catalogue (الرسائل ثابتة حرفيًا ما عدا VALIDATION_ERROR):**

| statusCode | code | message |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | ديناميكية (مثال: `text must be shorter than or equal to 2000 characters`) |
| 400 | `INVALID_CURSOR` | Invalid cursor |
| 400 | `EMPTY_UPDATE` | At least one field must be provided |
| 400 | `EMPTY_POST` | Post must contain text or at least one media item |
| 400 | `MEDIA_NOT_FOUND` | One or more media files were not uploaded |
| 400 | `INVALID_MEDIA` | Media file violates type or size limits |
| 400 | `INVALID_MEDIA_COMBINATION` | A post supports up to 4 images or exactly 1 video, not both |
| 401 | `UNAUTHENTICATED` | Missing bearer token |
| 401 | `INVALID_TOKEN` | Invalid or expired token |
| 403 | `ACCOUNT_SUSPENDED` | Account is suspended |
| 403 | `NOT_POST_OWNER` | You can only modify your own posts |
| 403 | `MEDIA_NOT_OWNED` | Media key does not belong to the current user |
| 403 | `CANNOT_REPORT_OWN_POST` | You cannot report your own post |
| 404 | `USER_NOT_FOUND` | User not found |
| 404 | `POST_NOT_FOUND` | Post not found |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `ALREADY_REPORTED` | You have already reported this post |
| 409 | `MEDIA_ALREADY_USED` | Media key is already in use |
| 409 | `POST_NOT_EDITABLE` | Hidden posts cannot be edited |
| 429 | `TOO_MANY_REQUESTS` | Too many requests, please try again later |
| 500 | `INTERNAL_ERROR` | Internal server error |
| 502 | `STORAGE_ERROR` | Storage service error |
| 503 | `SERVICE_UNAVAILABLE` | Database unavailable |

كل endpoint أدناه يذكر الأخطاء الخاصة به فقط (بالـstatus والـcode من الجدول أعلاه)، و`429 TOO_MANY_REQUESTS` ينطبق على كل الـendpoints عدا `/health`.

---

### 4.1 `GET /health`

- **Auth Level:** Public (`@Public()` + `@SkipThrottle()`)
- **Logic:** يتحقق من الاتصال بقاعدة البيانات عبر `SELECT 1`.
- **200 Response:**

```json
{ "status": "ok", "db": "up", "timestamp": "2026-10-21T10:00:00.000Z" }
```

- **Errors:** `503 SERVICE_UNAVAILABLE` إذا فشل `SELECT 1`.

### 4.2 `GET /auth/me`

- **Auth Level:** Mandatory Auth
- **Request:** لا body ولا query. هذا الـendpoint هو نقطة الـauto-provisioning الأولى للعميل بعد تسجيل الدخول.
- **200 Response (`UserMeDto`):**

```json
{
  "id": "5b0c1c1e-7a52-4c61-9d6f-0f4d6d3f1a11",
  "displayName": "Ahmed",
  "bio": null,
  "avatarUrl": null,
  "createdAt": "2026-10-21T10:00:00.000Z",
  "status": "ACTIVE"
}
```

- **Errors:** `401 UNAUTHENTICATED`, `401 INVALID_TOKEN`, `403 ACCOUNT_SUSPENDED`.

### 4.3 `PATCH /users/me`

- **Auth Level:** Mandatory Auth
- **Request DTO:**

```ts
export class UpdateProfileDto {
  @ValidateIf((o) => o.displayName !== undefined)   // null مرفوض لـdisplayName
  @Transform(({ value }) => (typeof value === 'string' ? sanitizeText(value) : value))
  @IsString() @MinLength(1) @MaxLength(50)
  displayName?: string;

  @IsOptional()                                      // null = مسح النبذة
  @Transform(({ value }) => (typeof value === 'string' ? sanitizeText(value) : value))
  @IsString() @MaxLength(160)
  bio?: string | null;

  @IsOptional()                                      // null = إزالة الصورة
  @IsString() @Matches(MEDIA_KEY_REGEX)
  avatarKey?: string | null;
}
```

- **Rules:**
  1. الـbody يجب أن يحتوي حقلًا واحدًا على الأقل، وإلا `400 EMPTY_UPDATE`.
  2. `bio` بعد الـsanitize إذا كانت `""` تُخزَّن `null`.
  3. `avatarKey` (إن لم تكن `null`) تمر على `verifyMediaKeys(userId, [key], 'AVATAR')` (Section 5.1): ملكية + HEAD + النوع IMAGE فقط + عدم وجود المفتاح في `post_media`.
  4. الـKey القديم للأفاتار لا يُحذف من الـStorage في الـrequest نفسه (يُنظَّف بالسكربت في Section 7.4).
- **200 Response:** `UserMeDto` بعد التعديل.
- **Errors:** `400 VALIDATION_ERROR`, `400 EMPTY_UPDATE`, `400 MEDIA_NOT_FOUND`, `400 INVALID_MEDIA`, `401 *`, `403 ACCOUNT_SUSPENDED`, `403 MEDIA_NOT_OWNED`, `409 MEDIA_ALREADY_USED`, `502 STORAGE_ERROR`.

### 4.4 `GET /users/:id`

- **Auth Level:** Public
- **Request:** `:id` → `ParseUUIDPipe` (غير UUID = `400 VALIDATION_ERROR`).
- **Rules:** يرجع 404 إذا المستخدم غير موجود **أو** `status = SUSPENDED`.
- **200 Response (`UserPublicDto`):**

```json
{
  "id": "5b0c1c1e-7a52-4c61-9d6f-0f4d6d3f1a11",
  "displayName": "Ahmed",
  "bio": "Backend dev",
  "avatarUrl": "https://media.example.com/media/5b0c1c1e-7a52-4c61-9d6f-0f4d6d3f1a11/0d9e2f4a-1c3b-4e5f-8a7b-6c5d4e3f2a1b.jpg",
  "createdAt": "2026-10-21T10:00:00.000Z"
}
```

- **Errors:** `400 VALIDATION_ERROR`, `404 USER_NOT_FOUND`.

### 4.5 `GET /users/:id/posts`

- **Auth Level:** Optional Auth
- **Request:** `:id` UUID + `PaginationQueryDto`:

```ts
export class PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(200)
  cursor?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit: number = 20;
}
```

- **Rules:**
  1. المستخدم المستهدف غير موجود أو `SUSPENDED` ← `404 USER_NOT_FOUND`.
  2. إذا `req.user?.id === :id` (صاحب الحساب): يرى `ACTIVE` و`HIDDEN`.
  3. غير ذلك (زائر أو مستخدم آخر): `ACTIVE` فقط.
  4. `DELETED` لا يظهر لأي أحد.
  5. الترتيب والـcursor كما في Section 5.2 (فلتر الـstatus يُمرَّر للـhelper حسب الحالة 2 أو 3).
- **200 Response (`Page<PostDto>`):**

```json
{
  "items": [
    {
      "id": "c2f1b7a0-3d54-4a8e-9b21-7e6d5c4b3a29",
      "text": "Hello world",
      "media": [
        { "url": "https://media.example.com/media/5b0c.../a1b2....jpg", "type": "IMAGE", "position": 0 }
      ],
      "status": "ACTIVE",
      "author": { "id": "5b0c1c1e-7a52-4c61-9d6f-0f4d6d3f1a11", "displayName": "Ahmed", "avatarUrl": null },
      "createdAt": "2026-10-21T10:05:00.000Z"
    }
  ],
  "nextCursor": "eyJjIjoiMjAyNi0xMC0yMVQxMDowNTowMC4wMDBaIiwiaSI6ImMyZjFiN2EwLTNkNTQtNGE4ZS05YjIxLTdlNmQ1YzRiM2EyOSJ9"
}
```

- **Errors:** `400 VALIDATION_ERROR`, `400 INVALID_CURSOR`, `401 INVALID_TOKEN`, `403 ACCOUNT_SUSPENDED` (عند إرسال token لمستخدم مقفول), `404 USER_NOT_FOUND`.

### 4.6 `POST /media/presign`

- **Auth Level:** Mandatory Auth (Throttle: `media presign 20/min`)
- **Request DTO:**

```ts
export class PresignDto {
  @IsEnum(MediaType)
  type!: MediaType;                       // IMAGE | VIDEO

  @IsString() @IsIn([...IMAGE_CONTENT_TYPES, ...VIDEO_CONTENT_TYPES])
  contentType!: string;                   // image/jpeg|image/png|image/webp|video/mp4|video/quicktime

  @Type(() => Number) @IsInt() @Min(1)
  sizeBytes!: number;

  @ValidateIf((o) => o.type === 'VIDEO')
  @Type(() => Number) @IsInt() @Min(1) @Max(VIDEO_MAX_SECONDS)
  durationSeconds?: number;               // مطلوب للفيديو فقط
}
```

- **Rules:** الخوارزمية في Section 5.1. الـendpoint لا يكتب في الـDB ولا يُنشئ أي سجل.
- **200 Response:**

```json
{
  "uploadUrl": "https://<bucket>.<account>.r2.cloudflarestorage.com/media/5b0c.../0d9e....jpg?X-Amz-Algorithm=...&X-Amz-Expires=300&X-Amz-Signature=...",
  "key": "media/5b0c1c1e-7a52-4c61-9d6f-0f4d6d3f1a11/0d9e2f4a-1c3b-4e5f-8a7b-6c5d4e3f2a1b.jpg",
  "method": "PUT",
  "headers": { "Content-Type": "image/jpeg" },
  "expiresAt": "2026-10-21T10:05:00.000Z"
}
```

العميل يجب أن يرفع بـ`PUT` مع نفس الـ`Content-Type` والحجم المُعلن، وإلا يرفضه الـStorage (الـheaders موقّعة).

- **Errors:** `400 VALIDATION_ERROR`, `401 *`, `403 ACCOUNT_SUSPENDED`.

### 4.7 `POST /posts`

- **Auth Level:** Mandatory Auth
- **Request DTO:**

```ts
export class CreatePostDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? sanitizeText(value) : value))
  @IsString() @MaxLength(POST_TEXT_MAX)           // 2000
  text?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(MEDIA_MAX_PER_POST) @ArrayUnique()
  @IsString({ each: true }) @Matches(MEDIA_KEY_REGEX, { each: true })
  mediaKeys?: string[];
}
```

`MEDIA_KEY_REGEX = /^media\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov)$/`. قيم الحدود (`POST_TEXT_MAX`...) تُقرأ من الـtyped config بعد التحقق عند الإقلاع.

- **Rules:**
  1. بعد الـsanitize، النص الفارغ يُعتبر غير موجود. إذا لا يوجد نص ولا ميديا ← `400 EMPTY_POST`.
  2. `verifyMediaKeys(userId, keys, 'POST')` (Section 5.1).
  3. الإنشاء بـ`prisma.post.create` مع nested `media: { create: [...] }` (عملية واحدة atomic). `position` = index المفتاح في المصفوفة بدءًا من 0.
  4. إذا فشل الـinsert بـ`P2002` على `PostMedia.key` ← `409 MEDIA_ALREADY_USED`.
- **201 Response:** `PostDto` (`status: "ACTIVE"`).
- **Errors:** `400 VALIDATION_ERROR`, `400 EMPTY_POST`, `400 MEDIA_NOT_FOUND`, `400 INVALID_MEDIA`, `400 INVALID_MEDIA_COMBINATION`, `401 *`, `403 ACCOUNT_SUSPENDED`, `403 MEDIA_NOT_OWNED`, `409 MEDIA_ALREADY_USED`, `502 STORAGE_ERROR`.

### 4.8 `GET /posts/:id`

- **Auth Level:** Public
- **Rules:** يرجع المنشور فقط إذا `post.status = ACTIVE` **و** `author.status = ACTIVE` (نفس فلتر الـfeed عبر الـhelper الموحد). غير ذلك `404` للجميع بما فيهم صاحب المنشور (قرار تثبيت للاتساق مع Feed وProfile؛ المصدر نص على 404 للـHIDDEN والـDELETED).
- **200 Response:** `PostDto`.
- **Errors:** `400 VALIDATION_ERROR`, `404 POST_NOT_FOUND`.

### 4.9 `PATCH /posts/:id`

- **Auth Level:** Mandatory Auth (صاحب المنشور فقط)
- **Request DTO:**

```ts
export class UpdatePostDto {
  @Transform(({ value }) => (typeof value === 'string' ? sanitizeText(value) : value))
  @ValidateIf((o) => o.text !== null)
  @IsString() @MaxLength(POST_TEXT_MAX)
  text!: string | null;                 // مطلوب. null مسموح فقط إذا للمنشور ميديا
}
```

- **Rules (بهذا الترتيب بالضبط):**
  1. المنشور غير موجود، أو `DELETED`، أو (`HIDDEN` والطالب ليس صاحبه) ← `404 POST_NOT_FOUND`.
  2. الطالب ليس صاحب المنشور (المنشور `ACTIVE`) ← `403 NOT_POST_OWNER`.
  3. الطالب صاحبه والمنشور `HIDDEN` ← `409 POST_NOT_EDITABLE`.
  4. النص الجديد فارغ (أو `null`) والمنشور بلا ميديا ← `400 EMPTY_POST`.
  5. التحديث: `text` فقط. الميديا غير قابلة للتعديل في V1.
- **200 Response:** `PostDto`.
- **Errors:** `400 VALIDATION_ERROR`, `400 EMPTY_POST`, `401 *`, `403 ACCOUNT_SUSPENDED`, `403 NOT_POST_OWNER`, `404 POST_NOT_FOUND`, `409 POST_NOT_EDITABLE`.

### 4.10 `DELETE /posts/:id`

- **Auth Level:** Mandatory Auth (صاحب المنشور فقط)
- **Rules:** نفس خطوات 1 و2 من 4.9. بعدها `status = DELETED` (soft delete). مسموح لصاحب المنشور حذف منشور `HIDDEN`. حذف منشور `DELETED` مسبقًا ← `404`.
- **204 Response:** No Content.
- **Errors:** `400 VALIDATION_ERROR`, `401 *`, `403 ACCOUNT_SUSPENDED`, `403 NOT_POST_OWNER`, `404 POST_NOT_FOUND`.

### 4.11 `GET /feed`

- **Auth Level:** Public
- **Request:** `PaginationQueryDto` (نفس 4.5).
- **Rules:** Section 5.2.
- **200 Response (`Page<PostDto>`):** نفس شكل 4.5 مع `status: "ACTIVE"` دائمًا. `nextCursor = null` عند انتهاء النتائج.
- **Errors:** `400 VALIDATION_ERROR`, `400 INVALID_CURSOR`.

### 4.12 `POST /posts/:id/report`

- **Auth Level:** Mandatory Auth (Throttle: `reports 5/min`)
- **Request DTO:**

```ts
export class ReportPostDto {
  @IsEnum(ReportReason)
  reason!: ReportReason;   // RELIGIOUS_VIOLATION | VIOLENCE | SPAM | OTHER
}
```

- **Rules:** الـtransaction في Section 5.3. الإبلاغ مسموح فقط على منشور `ACTIVE` صاحبه `ACTIVE`، وغير ذلك `404`.
- **201 Response** (لا تُكشف العدادات):

```json
{
  "id": "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  "postId": "c2f1b7a0-3d54-4a8e-9b21-7e6d5c4b3a29",
  "reason": "SPAM",
  "createdAt": "2026-10-21T10:10:00.000Z"
}
```

- **Errors:** `400 VALIDATION_ERROR`, `401 *`, `403 ACCOUNT_SUSPENDED`, `403 CANNOT_REPORT_OWN_POST`, `404 POST_NOT_FOUND`, `409 ALREADY_REPORTED`.

---

## 5. Algorithmic Business Logic & Edge Cases

### 5.1 Direct Media Upload Workflow

**المرحلة A: `POST /media/presign`**

```ts
const IMAGE_CT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
const VIDEO_CT = { 'video/mp4': 'mp4', 'video/quicktime': 'mov' } as const;

async presign(userId: string, dto: PresignDto) {
  // 1) Whitelist: نوع الـcontentType لازم يطابق dto.type
  const extMap = dto.type === 'IMAGE' ? IMAGE_CT : VIDEO_CT;
  const ext = extMap[dto.contentType];
  if (!ext) throw new AppException(400, 'VALIDATION_ERROR', 'contentType does not match type');

  // 2) Size / duration limits
  const maxBytes = dto.type === 'IMAGE' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES; // 5242880 | 52428800
  if (dto.sizeBytes > maxBytes) throw new AppException(400, 'VALIDATION_ERROR', `sizeBytes exceeds ${maxBytes}`);
  if (dto.type === 'VIDEO' && (!dto.durationSeconds || dto.durationSeconds > VIDEO_MAX_SECONDS))
    throw new AppException(400, 'VALIDATION_ERROR', `durationSeconds must be between 1 and ${VIDEO_MAX_SECONDS}`);

  // 3) Key naming convention: media/{userId}/{uuid}.{ext}
  const key = `media/${userId}/${randomUUID()}.${ext}`;

  // 4) Presigned PUT. ContentType وContentLength موقّعان فيُفرضان من الـStorage نفسه
  const cmd = new PutObjectCommand({
    Bucket: S3_BUCKET, Key: key, ContentType: dto.contentType, ContentLength: dto.sizeBytes,
  });
  const uploadUrl = await getSignedUrl(s3, cmd, {
    expiresIn: PRESIGN_EXPIRES_SECONDS,                       // 300
    signableHeaders: new Set(['content-type', 'content-length']),
  });
  return {
    uploadUrl, key, method: 'PUT',
    headers: { 'Content-Type': dto.contentType },
    expiresAt: new Date(Date.now() + PRESIGN_EXPIRES_SECONDS * 1000).toISOString(),
  };
}
```

**ملاحظة قبول مخاطرة (V1):** مدة الفيديو (`durationSeconds`) يعلنها العميل ولا يمكن للسيرفر التحقق منها بدون معالجة الفيديو (محظور في V1). الحجم والنوع يُفرضان فعليًا، أما المدة فهي حد على مستوى العميل فقط وتُراجَع يدويًا مع الـModeration.

**المرحلة B: التحقق عند `POST /posts` و`PATCH /users/me`**

```ts
async verifyMediaKeys(userId: string, keys: string[], purpose: 'POST' | 'AVATAR') {
  const prefix = `media/${userId}/`;

  // 1) Ownership أولًا (قبل أي نداء للـStorage)
  for (const key of keys)
    if (!key.startsWith(prefix)) throw new AppException(403, 'MEDIA_NOT_OWNED', 'Media key does not belong to the current user');

  // 2) HEAD لكل مفتاح بالتوازي
  const verified = await Promise.all(keys.map(async (key, position) => {
    let head: HeadObjectCommandOutput;
    try { head = await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key })); }
    catch (e: any) {
      if (e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404)
        throw new AppException(400, 'MEDIA_NOT_FOUND', 'One or more media files were not uploaded');
      throw new AppException(502, 'STORAGE_ERROR', 'Storage service error');
    }
    const ct = head.ContentType ?? '';
    const size = head.ContentLength ?? 0;
    const ext = key.split('.').pop();
    const type: MediaType | null = ct in IMAGE_CT ? 'IMAGE' : ct in VIDEO_CT ? 'VIDEO' : null;
    const expectedExt = type === 'IMAGE' ? IMAGE_CT[ct] : type === 'VIDEO' ? VIDEO_CT[ct] : null;
    const maxBytes = type === 'IMAGE' ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
    if (!type || ext !== expectedExt || size < 1 || size > maxBytes)
      throw new AppException(400, 'INVALID_MEDIA', 'Media file violates type or size limits');
    return { key, type, position };
  }));

  // 3) Combination rules
  const videos = verified.filter((m) => m.type === 'VIDEO').length;
  if (purpose === 'AVATAR') {
    if (verified.length !== 1 || videos > 0)
      throw new AppException(400, 'INVALID_MEDIA', 'Media file violates type or size limits');
  } else if (videos > 0 && verified.length !== 1) {
    throw new AppException(400, 'INVALID_MEDIA_COMBINATION', 'A post supports up to 4 images or exactly 1 video, not both');
  }

  // 4) Reuse guard: المفتاح لا يكون مرتبطًا بمنشور آخر (الـunique constraint هو خط الدفاع الأخير)
  const used = await prisma.postMedia.findFirst({ where: { key: { in: keys } }, select: { key: true } });
  if (used) throw new AppException(409, 'MEDIA_ALREADY_USED', 'Media key is already in use');

  return verified;   // [{ key, type, position }]
}
```

### 5.2 Cursor-Based Pagination Algorithm (`GET /feed` و`GET /users/:id/posts`)

**الـCursor:** `base64url(JSON.stringify({ c: <createdAt ISO>, i: <id> }))`. أي cursor لا يمكن فك تشفيره أو لا يحتوي `c` تاريخ صالح و`i` UUID صالح ← `400 INVALID_CURSOR`. دقة `createdAt` في Prisma هي milliseconds (`TIMESTAMP(3)`) فلا يحدث فقد دقة بين الـcursor والـDB.

**الـHelper الموحد للفلتر (`common/status-filters.ts`)** وهو المكان الوحيد الذي يُعرَّف فيه الفلتر (P6):

```ts
export const visiblePostWhere = (opts?: { includeHiddenForAuthorId?: string }): Prisma.PostWhereInput => ({
  author: { status: 'ACTIVE' },
  OR: opts?.includeHiddenForAuthorId
    ? [{ status: 'ACTIVE' }, { status: 'HIDDEN', authorId: opts.includeHiddenForAuthorId }]
    : [{ status: 'ACTIVE' }],
});
```

**الخوارزمية:**

```ts
async listPosts(args: { limit: number; cursor?: string; extraWhere?: Prisma.PostWhereInput }) {
  const { limit, cursor, extraWhere } = args;
  const c = cursor ? decodeCursor(cursor) : null;               // throws 400 INVALID_CURSOR

  const rows = await prisma.post.findMany({
    where: {
      AND: [
        visiblePostWhere(/* feed: بدون opts */),
        ...(extraWhere ? [extraWhere] : []),                    // مثال: { authorId }
        ...(c ? [{ OR: [
          { createdAt: { lt: c.createdAt } },
          { createdAt: c.createdAt, id: { lt: c.id } },
        ] }] : []),
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,                                            // صف زائد لمعرفة وجود صفحة تالية
    include: { media: { orderBy: { position: 'asc' } }, author: { select: { id: true, displayName: true, avatarKey: true } } },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items: items.map(toPostDto), nextCursor: hasMore ? encodeCursor(last.createdAt, last.id) : null };
}
```

**شرط الفلترة للـFeed:** `post.status == ACTIVE AND author.status == ACTIVE`. ثبات الـpagination: المنشورات الجديدة لها `createdAt` أكبر من أي cursor سابق فلا تُدخل نفسها في الصفحات التالية ولا تُزيح عناصر (عكس الـoffset).

### 5.3 Atomic Moderation Transaction (`POST /posts/:id/report`)

كل الخطوات داخل `prisma.$transaction(async (tx) => {...}, { maxWait: 5000, timeout: 10000 })`. أي `throw` داخل الـcallback يعمل rollback كامل. ترتيب الأقفال ثابت دائمًا (**post ثم user**) لمنع الـdeadlock.

```ts
async report(reporterId: string, postId: string, reason: ReportReason) {
  return prisma.$transaction(async (tx) => {
    // Step 0: تحميل المنشور بشرط أنه ظاهر (ACTIVE وصاحبه ACTIVE)
    const post = await tx.post.findFirst({
      where: { id: postId, status: 'ACTIVE', author: { status: 'ACTIVE' } },
      select: { id: true, authorId: true },
    });
    if (!post) throw new AppException(404, 'POST_NOT_FOUND', 'Post not found');

    // Step 1: المبلّغ ليس صاحب المنشور
    if (post.authorId === reporterId)
      throw new AppException(403, 'CANNOT_REPORT_OWN_POST', 'You cannot report your own post');

    // Step 2: إدخال البلاغ (UNIQUE(postId, reporterId))
    let report;
    try { report = await tx.report.create({ data: { postId, reporterId, reason } }); }
    catch (e) {
      if (isPrismaError(e, 'P2002')) throw new AppException(409, 'ALREADY_REPORTED', 'You have already reported this post');
      throw e;
    }

    // Step 3: increment ذري للمنشور + القيمة الراجعة
    const { reportCount: postCount } = await tx.post.update({
      where: { id: postId }, data: { reportCount: { increment: 1 } }, select: { reportCount: true },
    });

    // Step 4: عتبة المنشور (على القيمة الراجعة وليس قيمة مقروءة قبل)
    if (postCount >= POST_REPORT_THRESHOLD)                       // 7
      await tx.post.updateMany({ where: { id: postId, status: 'ACTIVE' }, data: { status: 'HIDDEN' } });

    // Step 5: increment ذري لصاحب المنشور + القيمة الراجعة
    const { reportCount: userCount } = await tx.user.update({
      where: { id: post.authorId }, data: { reportCount: { increment: 1 } }, select: { reportCount: true },
    });

    // Step 6: عتبة المستخدم
    if (userCount >= USER_REPORT_THRESHOLD)                       // 15
      await tx.user.updateMany({ where: { id: post.authorId, status: 'ACTIVE' }, data: { status: 'SUSPENDED' } });

    return { id: report.id, postId, reason: report.reason, createdAt: report.createdAt };
  }, { maxWait: 5000, timeout: 10000 });
}
```

**ملاحظات تنفيذية:**
1. استخدام `>=` (وليس `===`) مع `updateMany` المشروط بالـ`status` يجعل الخطوتين 4 و6 idempotent عند التزامن، ولا يُعاد إحياء منشور حذفه صاحبه أثناء الـtransaction.
2. `Postgres READ COMMITTED` (الافتراضي) كافٍ لأن الـincrement يتم على الصف نفسه بقفل صف، والـthreshold يُفحص على القيمة الراجعة.
3. عدّاد المستخدم يزيد مع كل بلاغ على أي منشور له (Section 1.5)، حتى لو أخفى هذا البلاغ المنشور.
4. بعد إخفاء المنشور لا تُقبل بلاغات إضافية عليه (404 من Step 0)، فعدّاد المستخدم لا يتضخم من منشورات مخفية.

### 5.4 Status Visibility Matrix (آثار الإخفاء والقفل)

| Endpoint | Post `HIDDEN` | Post `DELETED` | Author `SUSPENDED` |
| --- | --- | --- | --- |
| `GET /feed` | لا يظهر | لا يظهر | لا يظهر |
| `GET /posts/:id` | 404 | 404 | 404 |
| `GET /users/:id/posts` | يظهر لصاحبه فقط | لا يظهر | 404 |
| `GET /users/:id` | — | — | 404 |
| `PATCH /posts/:id` | 409 للصاحب، 404 لغيره | 404 | الصاحب يأخذ 403 `ACCOUNT_SUSPENDED` (من الـguard) |
| `DELETE /posts/:id` | مسموح للصاحب | 404 | 403 للصاحب |
| `POST /posts/:id/report` | 404 | 404 | 404 |
| أي endpoint Mandatory/Optional (بـtoken المقفول) | — | — | 403 `ACCOUNT_SUSPENDED` |
| أي endpoint Public | — | — | يعمل كزائر (الـtoken مُتجاهَل) |

---

## 6. Non-Functional, Security & Operational Rules

### 6.1 Rate Limiting (Throttling)

```ts
ThrottlerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (cfg: ConfigService) => ([{ ttl: cfg.get('THROTTLE_TTL_SECONDS') * 1000, limit: cfg.get('THROTTLE_GLOBAL_LIMIT') }]),
}),
// providers (الترتيب مهم: Throttler أولًا ثم Auth):
{ provide: APP_GUARD, useClass: ThrottlerGuard },
{ provide: APP_GUARD, useClass: AuthGuard },
```

| Scope | Limit | Env Var |
| --- | --- | --- |
| Global (per IP) | 100 req / 60 s | `THROTTLE_GLOBAL_LIMIT=100`, `THROTTLE_TTL_SECONDS=60` |
| `POST /posts/:id/report` | 5 req / 60 s | `THROTTLE_REPORTS_LIMIT=5` |
| `POST /media/presign` | 20 req / 60 s | `THROTTLE_PRESIGN_LIMIT=20` |
| `GET /health` | `@SkipThrottle()` | — |

التجاوز ← `429 TOO_MANY_REQUESTS`. الـstorage in-memory لأن V1 instance واحد. خلف reverse proxy يجب `app.set('trust proxy', 1)` وإلا يُحسب كل الزوار كـIP واحد.

### 6.2 Global Error Handling

```ts
export class AppException extends HttpException {
  constructor(statusCode: number, public readonly code: string, message: string) {
    super({ statusCode, code, message }, statusCode);
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    let body: { statusCode: number; code: string; message: string };

    if (exception instanceof AppException) {
      body = exception.getResponse() as typeof body;
    } else if (exception instanceof ThrottlerException) {
      body = { statusCode: 429, code: 'TOO_MANY_REQUESTS', message: 'Too many requests, please try again later' };
    } else if (exception instanceof NotFoundException) {
      body = { statusCode: 404, code: 'NOT_FOUND', message: 'Resource not found' };
    } else if (exception instanceof BadRequestException) {   // من الـValidationPipe
      const r: any = exception.getResponse();
      const msg = Array.isArray(r?.message) ? r.message.join('; ') : String(r?.message ?? 'Bad request');
      body = { statusCode: 400, code: 'VALIDATION_ERROR', message: msg };
    } else {
      this.logger.error({ err: exception, reqId: (req as any).id }, 'Unhandled exception');
      body = { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
    }
    res.status(body.statusCode).json(body);
  }
}
```

القواعد: (1) كل الأخطاء تخرج بالشكل `{ statusCode, code, message }` فقط. (2) لا stack ولا تفاصيل Prisma/Firebase/S3 تُرجَع للعميل أبدًا. (3) أخطاء 5xx تُسجَّل مع الـrequest id، وأخطاء 4xx المتوقعة لا تُسجَّل كـerror.

### 6.3 Security Protocols

| Area | Rule |
| --- | --- |
| Helmet | `app.use(helmet())` بالإعدادات الافتراضية. |
| CORS | `origin` من `CORS_ORIGINS` (whitelist صريحة، ممنوع `*`)، `methods: GET,POST,PATCH,DELETE,OPTIONS`، `allowedHeaders: Authorization,Content-Type`. |
| Body limit | JSON بحد أقصى `100kb` (السيرفر لا يستلم ملفات). |
| Input Sanitization | `sanitizeText(v)`: `trim` + حذف الـNUL والـcontrol characters عدا `\n` و`\t`. النصوص تُخزَّن plain text والـescaping عند العرض مسؤولية العميل. |
| SQL Injection | Prisma parameterized queries فقط. ممنوع `$queryRawUnsafe`، و`$queryRaw` مسموح فقط بـtagged template (يُستخدم في `/health` فقط). |
| Validation | `whitelist + forbidNonWhitelisted` (Section 4.0). |
| Secrets | كلها من env، ولا شيء في الـrepo. فشل الإقلاع إذا ناقص. |
| Logging | `nestjs-pino` JSON، `genReqId` من `x-request-id` أو UUID (يُرجَع في response header)، و`redact: ['req.headers.authorization', 'req.headers.cookie']`. ممنوع تسجيل الـtokens أو `uploadUrl`. |
| Swagger | مفعّل خارج `production` فقط، مع `addBearerAuth()`. |
| Shutdown | `app.enableShutdownHooks()` لإغلاق Prisma بشكل سليم. |

---

## 7. Operations & Manual Runbook (Admin Tasks)

لا توجد لوحة Admin في V1. كل المراجعة تتم مباشرة على قاعدة البيانات عبر `psql`. قبل أي تعديل: نفّذ على `staging` أولًا، وخذ نسخة (`pg_dump`) قبل أي عملية على `production`. أسماء الجداول snake_case وأسماء الأعمدة camelCase ولذلك تُكتب بين `"`. عمود `updatedAt` لا يملك default في الـDB (Prisma يضبطه من الـclient) فيجب ضبطه يدويًا في أي `UPDATE`.

### 7.1 Review Queue (مراجعة البلاغات)

```sql
-- المنشورات المخفية بانتظار المراجعة مع أسباب البلاغات
SELECT p.id, p."authorId", p."reportCount", p."createdAt", left(p.text, 120) AS preview,
       array_agg(r.reason ORDER BY r."createdAt") AS reasons
FROM posts p
JOIN reports r ON r."postId" = p.id
WHERE p.status = 'HIDDEN'
GROUP BY p.id
ORDER BY p."reportCount" DESC, p."createdAt" DESC;

-- الحسابات المقفولة
SELECT id, "displayName", "reportCount", "updatedAt" FROM users WHERE status = 'SUSPENDED' ORDER BY "updatedAt" DESC;
```

### 7.2 Reinstate a Hidden Post (`HIDDEN` → `ACTIVE`)

يضبط حالة المنشور و`reportCount = 0`، ويُنقص `reportCount` صاحبه بقيمة بلاغات المنشور (بحد أدنى 0). جدول `reports` يبقى كما هو حتى لا يعيد نفس المبلّغين الإبلاغ.

```sql
\set post_id '00000000-0000-0000-0000-000000000000'

BEGIN;
WITH p AS (
  SELECT id, "authorId", "reportCount" FROM posts
  WHERE id = :'post_id' AND status = 'HIDDEN' FOR UPDATE
), u AS (
  UPDATE users SET "reportCount" = GREATEST(0, users."reportCount" - p."reportCount"), "updatedAt" = now()
  FROM p WHERE users.id = p."authorId"
  RETURNING users.id
)
UPDATE posts SET status = 'ACTIVE', "reportCount" = 0, "updatedAt" = now()
WHERE id IN (SELECT id FROM p)
RETURNING id, status, "reportCount";
-- راجع النتيجة: صف واحد = نجاح، صفر صفوف = المنشور ليس HIDDEN أو غير موجود
COMMIT;   -- أو ROLLBACK;
```

**تنبيه:** إذا كان صاحب المنشور `SUSPENDED` فسيبقى المنشور غير ظاهر حتى يُفك قفل الحساب (7.3).

### 7.3 Un-suspend a User (`SUSPENDED` → `ACTIVE`)

```sql
\set user_id '00000000-0000-0000-0000-000000000000'

UPDATE users SET status = 'ACTIVE', "reportCount" = 0, "updatedAt" = now()
WHERE id = :'user_id' AND status = 'SUSPENDED'
RETURNING id, "displayName", status, "reportCount";
```

منشورات المستخدم التي أُخفيت سابقًا تبقى `HIDDEN` وتُسترجع منشورًا منشورًا عبر 7.2. بعد الاسترجاع يبدأ العدّاد من الصفر ويعمل الإخفاء/القفل التلقائي مجددًا عند العتبات.

### 7.4 Data Cleanup & Maintenance Procedures

**أ) حذف نهائي لمنشور (نادر، بعد قرار واضح):**

```sql
\set post_id '00000000-0000-0000-0000-000000000000'

BEGIN;
-- 1) سجّل مفاتيح الميديا أولًا (لحذفها من R2 يدويًا بعد الـCOMMIT)
SELECT key FROM post_media WHERE "postId" = :'post_id';
-- 2) الحذف (Cascade يحذف post_media و reports)
DELETE FROM posts WHERE id = :'post_id' RETURNING id;
COMMIT;
```

بعدها احذف الملفات من R2 بالمفاتيح المسجلة. تعديل `reportCount` للمستخدم بعد الحذف النهائي اختياري ويُقرَّر مع الحالة.

**ب) تنظيف الملفات اليتيمة في الـStorage** (ملفات رُفعت ولم تُرفق بمنشور، أو أفاتار قديم). تُشغَّل أسبوعيًا يدويًا، وبوضع `DRY_RUN=true` افتراضيًا:

```ts
// scripts/cleanup-orphan-media.ts
const DRY_RUN = process.env.DRY_RUN !== 'false';
const MIN_AGE_MS = 24 * 60 * 60 * 1000;   // لا يُحذف أي ملف أحدث من 24 ساعة (رفع قيد التنفيذ)

const used = new Set<string>([
  ...(await prisma.postMedia.findMany({ select: { key: true } })).map((m) => m.key),
  ...(await prisma.user.findMany({ where: { avatarKey: { not: null } }, select: { avatarKey: true } })).map((u) => u.avatarKey!),
]);

let token: string | undefined;
do {
  const page = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: 'media/', ContinuationToken: token }));
  for (const obj of page.Contents ?? []) {
    const old = Date.now() - (obj.LastModified?.getTime() ?? Date.now()) > MIN_AGE_MS;
    if (old && obj.Key && !used.has(obj.Key)) {
      console.log(DRY_RUN ? '[dry-run] would delete' : 'deleting', obj.Key);
      if (!DRY_RUN) await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: obj.Key }));
    }
  }
  token = page.NextContinuationToken;
} while (token);
```

**ج) إجراءات دورية:**

| Task | Frequency | Command / Action |
| --- | --- | --- |
| Backup قاعدة البيانات | يوميًا | `pg_dump --format=custom "$DATABASE_URL" > backup_$(date +%F).dump` والاحتفاظ بآخر 14 نسخة |
| Migrations | عند كل نشر | `prisma migrate deploy` (ممنوع `db push` خارج الـlocal) |
| مراجعة البلاغات | يحدد المهندس الدورية (نقطة مفتوحة #5 في المصدر) | استعلامات 7.1 |
| تنظيف الميديا اليتيمة | أسبوعيًا | السكربت في (ب) |
| فحص الـindexes | قبل الإطلاق وبعده | `EXPLAIN ANALYZE` على استعلام الـfeed للتأكد من استخدام `posts(status, createdAt DESC, id DESC)` |
| حذف مستخدم نهائيًا | غير مدعوم في V1 | `onDelete: Restrict` يمنعه عمدًا. يحتاج قرارًا هندسيًا منفصلًا |
