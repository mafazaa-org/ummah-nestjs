# Master Implementation & Testing Plan — Backend V2 (Ummah App)
## الدليل التنفيذي الشامل وخطة العمل والاختبارات الدقيقة للنسخة الثانية: الشات، المجموعات المتقدمة، التعليقات، الفويس نوت، وفحص الفيروسات، والمكالمات الصوتية المشفرة E2EE

> **وثيقة معيارية ملزمة:** هذا الملف مشتق ومطور بالكامل من:
> 1. مواصفة `BRD_PRD_Backend_V2_Chat_Groups_Calls.md`
> 2. وثيقة `BRD_PRD_Backend_V1_Technical_Specification.md` وخطة `MASTER_IMPLEMENTATION_AND_TESTING_PLAN_V1.md`
> 3. المتطلبات الهندسية المعيارية المعتمدة: أمان مطلق وعزل تام للمحادثات (Zero-Leak & Zero-Eavesdropping)، مستويات خصوصية المجموعات الثلاثية (`PUBLIC` / `PRIVATE` / `SECRET`)، طلبات وروابط الانضمام، نظام إدارة الأدوار (`OWNER` / `ADMIN` / `MEMBER`)، وحدة التعليقات على المنشورات (`comments`)، والتأسيس المستقبلي للسوبر أدمن (`SUPER_ADMIN`) ومجتمعات المنشورات.
>
> **المبادئ المعمارية الذهبية (Non-Negotiable Architectural Invariants):**
> - **Zero V1 Regressions:** كل عقود V1 ومساراتها وفلاتر أخطائها تعمل بلا كسر (Backward-Compatible 100%).
> - **Private by Default:** كل ما يخص الشات والوسائط والمكالمات خاص؛ لا توجد أي روابط عامة أو وصول غير مفحوص.
> - **Fail-Closed Security:** أي مرفق لا يتاح للتحميل إطلاقاً إلا بعد اجتياز فحص ClamAV بنجاح. فشل الفاحص أو توقفه = المرفق معلق `PENDING` ومحجوب.
> - **DB as Single Source of Truth:** كل حدث يُكتب ويُقفل في PostgreSQL أولاً قبل بثه على الـ WebSockets أو إرساله للـ Queues.
> - **Zero-Trace Secret Groups:** المجموعات السرية (`SECRET`) تُرجع `404 CONVERSATION_NOT_FOUND` لأي غير عضو؛ لا يمكن كشف وجودها أو التلصص عليها.
> - **Historic Message Protection:** العضو الجديد يرى حصراً الرسائل اللاحقة لانضمامه (`seq > joinedSeq`).
> - **Zero-Overengineering Modular Monolith:** تشغيل كامل في عملية رئيسية `api` وعملية خلفية `worker` دون تعقيدات الخدمات المصغرة (No Microservices Runtime Overhead).

---

## 1. الهيكلية المعمارية المعتمدة وأنماط التصميم (Architecture & Design Patterns)

```
                                  [ Cloudflare WAF / HTTPS / WSS ]
                                                 │
                                                 ▼
                                     [ PgBouncer Connection Pool ]
                                                 │
                   ┌─────────────────────────────┴─────────────────────────────┐
                   │                                                           │
                   ▼                                                           ▼
       ┌───────────────────────┐                                   ┌───────────────────────┐
       │   API Node (NestJS)   │◄──── Redis Adapter (Fan-out) ────►│   API Node (NestJS)   │
       │  HTTP REST + WS /chat │                                   │  HTTP REST + WS /chat │
       └───────────┬───────────┘                                   └───────────┬───────────┘
                   │                                                           │
                   ├───────────────────────┬───────────────────────────────────┤
                   │                       │                                   │
                   ▼                       ▼                                   ▼
        ┌─────────────────────┐ ┌─────────────────────┐             ┌─────────────────────┐
        │  PostgreSQL Master  │ │   Redis 7 (Alpine)  │             │ Cloudflare R2 / S3  │
        │  - Strict Schema    │ │   - Adapter & PubSub│             │ - Private chat/*    │
        │  - Atomic Locks     │ │   - BullMQ Queues   │             │ - Public media/*    │
        │  - Keyset Indexing  │ │   - Throttler Store │             └─────────────────────┘
        └─────────────────────┘ └──────────┬──────────┘
                                           │
                                           ▼
                                ┌───────────────────────┐           ┌─────────────────────┐
                                │   Worker (BullMQ)     │──────────►│ ClamAV (TCP Socket) │
                                │ - Antivirus Scan Job  │◄──────────│ clamd:3310 STREAM   │
                                │ - Push Notification   │           └─────────────────────┘
                                │ - Call Timeout Sweep  │           ┌─────────────────────┐
                                │ - R2 Cleanup Job      │──────────►│ LiveKit SFU Server  │
                                └───────────────────────┘           │ WebRTC E2EE Audio   │
                                                                    └─────────────────────┘
```

### 1.1 أنماط التصميم المعتمدة (Design Patterns)
1. **Modular Monolith & Separation of Concerns:**
   عزل ميزات V2 في وحدات نقية (`conversations`, `messages`, `chat-media`, `realtime`, `calls`, `blocks`, `devices`, `comments`, `queues`). لا يوجد تداخل مباشر لقواعد البيانات خارج نطاق الـ Services المعتمدة.
2. **Atomic Sequencing & Lock-Striping (Row-Level Locking):**
   توليد أرقام الرسائل المتسلسلة `seq` ذرياً داخل PostgreSQL Transaction باستخدام تحديث وقفل صف المحادثة (`UPDATE conversations SET lastSeq = lastSeq + 1 WHERE id = ...`) لمنع أي ثغرات أو تكرار في الترقيم تحت ضغط التزامن العالي.
3. **Idempotency Key Pattern:**
   منع تكرار إرسال الرسائل عبر قيد فريد مركب `@@unique([conversationId, senderId, clientMsgId])`، مما يسمح للعميل بإعادة إرسال الرسالة بأمان عند تذبذب شبكة الهاتف دون إنشاء رسائل مكررة.
4. **Blind E2EE Key Relay Pattern:**
   الخادم يعمل كوسيط أعمى (Blind Broker) لنقل مفاتيح التشفير اللحظية `call.key` بين المتصلين في المكالمات دون امتلاك مفاتيح فك التشفير إطلاقاً.
5. **Fail-Closed Streamed Antivirus Pipeline:**
   فحص الفيروسات عبر دفق البيانات مباشرة `INSTREAM` من التخزين السحابي إلى محرك `ClamAV` دون استهلاك رامات الخادم، مع حجب المرفق بحالة `PENDING` حتى يصدر قرار الفاحص.
6. **Masking & Information-Hiding Guard Pattern:**
   حماية المجموعات السرية والبيانات الخاصة بإرجاع `404 CONVERSATION_NOT_FOUND` بدلاً من `403 Forbidden` عند محاولة غير الأعضاء الاستعلام عنها، لمنع هجمات التخمين والمسح (BOLA/IDOR Enumeration).

---

## 2. الهيكل الشجري للمشروع بعد إضافات V2 (Project File Tree)

```text
c:\projects\mafaza\new ommah app\
├── .env.example
├── .env.test
├── docker-compose.yml                     # تم تحديثه: postgres, redis, clamd, pgbouncer
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── prisma/
│   ├── schema.prisma                      # مخطط V1 + إضافات V2 والتعليقات والخصوصية
│   └── migrations/
│       ├── 20261026_init_v1/
│       └── 20261028_backend_v2_features/
├── scripts/
│   ├── cleanup-orphan-media.ts            # فحص وحذف وسائط V1 و V2 اليتيمة
│   └── seed.ts                            # بذر البيانات وتجهيز حساب Super Admin
└── src/
    ├── main.ts                            # تهيئة الـ API والـ WS Adapter
    ├── worker.ts                          # معالج الطوابير المستقل (BullMQ Worker Process)
    ├── app.module.ts                      # تسجيل وحدات V1 و V2
    ├── config/
    │   ├── configuration.ts               # متغيرات بيئة V1 و V2 المحدثة
    │   └── env.validation.ts              # التحقق الصارم من مدخلات البيئة لـ V2
    ├── common/
    │   ├── constants/
    │   │   ├── auth-mode.constant.ts
    │   │   ├── limits.constant.ts         # ثوابت الشات، المجموعات، المكالمات، التعليقات
    │   │   └── v2-events.constant.ts      # ثوابت أسماء أحداث Socket.IO
    │   ├── decorators/
    │   │   ├── auth-mode.decorator.ts
    │   │   ├── current-user.decorator.ts
    │   │   └── roles.decorator.ts         # دعم الأدوار العامة ورتب المجموعات
    │   ├── exceptions/
    │   │   ├── app.exception.ts
    │   │   ├── all-exceptions.filter.ts   # فلتر الأخطاء العام لـ HTTP
    │   │   └── ws-exception.filter.ts     # فلتر أخطاء الـ WebSockets بنفس البنية
    │   ├── guards/
    │   │   ├── auth.guard.ts              # حارس الـ JWT لـ HTTP
    │   │   └── conversation-member.guard.ts # حارس العضوية الصارم
    │   └── utils/
    │       ├── cursor.util.ts
    │       ├── sanitizer.util.ts          # تنقية النصوص وأسماء الملفات
    │       └── status-filters.ts
    ├── prisma/
    │   ├── prisma.module.ts
    │   └── prisma.service.ts
    └── modules/
        ├── health/                        # فحص صحة النظام مع Redis و DB
        ├── auth/
        ├── users/
        ├── posts/                         # المنشورات مع تكامل التعليقات والمجتمعات
        ├── comments/                      # [NEW] وحدة التعليقات الشاملة
        │   ├── dto/
        │   │   └── create-comment.dto.ts
        │   ├── comments.controller.ts
        │   ├── comments.service.ts
        │   ├── comments.module.ts
        │   └── __tests__/
        │       └── comments.e2e.spec.ts
        ├── blocks/                        # [NEW] وحدة حظر المستخدمين
        │   ├── blocks.controller.ts
        │   ├── blocks.service.ts
        │   ├── blocks.module.ts
        │   └── __tests__/
        │       └── blocks.e2e.spec.ts
        ├── devices/                       # [NEW] إدارة توكنات الأجهزة وإشعارات Push
        │   ├── dto/
        │   │   └── register-device.dto.ts
        │   ├── devices.controller.ts
        │   ├── devices.service.ts
        │   ├── devices.module.ts
        │   └── __tests__/
        │       └── devices.e2e.spec.ts
        ├── conversations/                 # [NEW] المحادثات، المجموعات، والخصوصية
        │   ├── dto/
        │   │   ├── create-direct.dto.ts
        │   │   ├── create-group.dto.ts
        │   │   ├── update-group.dto.ts
        │   │   ├── group-members.dto.ts
        │   │   ├── join-request.dto.ts
        │   │   └── pagination-query.dto.ts
        │   ├── conversations.controller.ts
        │   ├── conversations.service.ts
        │   ├── conversations.module.ts
        │   └── __tests__/
        │       └── conversations.e2e.spec.ts
        ├── messages/                      # [NEW] منطق إرسال وتعديل وتدقيق الرسائل
        │   ├── dto/
        │   │   ├── send-message.dto.ts
        │   │   ├── update-message.dto.ts
        │   │   └── report-message.dto.ts
        │   ├── messages.controller.ts
        │   ├── messages.service.ts
        │   ├── messages.module.ts
        │   └── __tests__/
        │       └── messages.e2e.spec.ts
        ├── chat-media/                    # [NEW] وسائط الشات الخاصة وفحص الأمان
        │   ├── dto/
        │   │   ├── chat-presign.dto.ts
        │   │   └── batch-attachment-urls.dto.ts
        │   ├── chat-media.controller.ts
        │   ├── chat-media.service.ts
        │   ├── chat-media.module.ts
        │   └── __tests__/
        │       └── chat-media.e2e.spec.ts
        ├── realtime/                      # [NEW] خادم Socket.IO وقنوات الزمن الفعلي
        │   ├── adapters/
        │   │   └── redis-io.adapter.ts
        │   ├── guards/
        │   │   └── ws-auth.guard.ts
        │   ├── chat.gateway.ts
        │   ├── realtime.service.ts
        │   ├── realtime.module.ts
        │   └── __tests__/
        │       └── realtime.gateway.spec.ts
        ├── calls/                         # [NEW] المكالمات الصوتية المشفرة و LiveKit
        │   ├── dto/
        │   │   └── call-action.dto.ts
        │   ├── livekit.service.ts
        │   ├── calls.controller.ts
        │   ├── calls.service.ts
        │   ├── calls.module.ts
        │   └── __tests__/
        │       └── calls.e2e.spec.ts
        └── queues/                        # [NEW] معالجة طوابير BullMQ الخلفية
            ├── processors/
            │   ├── scan.processor.ts      # فحص الفيروسات عبر ClamAV
            │   ├── push.processor.ts      # إرسال إشعارات FCM / APNs VoIP
            │   ├── call-timeout.processor.ts # معالجة رنين المكالمات العالقة
            │   └── cleanup.processor.ts   # تنظيف مرفقات R2 المحذوفة
            ├── queues.module.ts
            └── queues.service.ts
```

---

## 3. المراحل التنفيذية المتسلسلة (Step-by-Step Execution Plan)

---

### المرحلة 0: البنية التحتية، الإعداد، وتحديثات V1 التوافقية (Infrastructure & V1 Upgrades)

#### 0.1 الأهداف والنطاق
1. تثبيت الحزم البرمجية الجديدة اللازمة لـ V2 (Redis, BullMQ, Socket.IO, LiveKit, ClamAV, APNs).
2. تحديث ملف `docker-compose.yml` لإضافة حاويات `redis` و `clamav` و `pgbouncer`.
3. ترقية `env.validation.ts` و `configuration.ts` لضبط كافة متغيرات V2 الصارمة مع قيم افتراضية آمنة.
4. تحديث نقطة نهاية فحص الصحة `GET /health` لتفحص اتصال Redis وتفشل بحالة `503 Service Unavailable` في حال تعطله.
5. تحديث `AllExceptionsFilter` ليدعم تحويل أخطاء `WsExceptionFilter` لنفس النمط الموحد.

#### 0.2 أوامر تثبيت الاعتماديات (Dependencies Installation)
```bash
# الاعتماديات الأساسية للإنتاج
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io @socket.io/redis-adapter ioredis bullmq @nest-lab/throttler-storage-redis livekit-server-sdk clamscan apns2

# اعتماديات التطوير والاختبار والأنواع
npm install --save-dev @types/clamscan socket.io-client
```

#### 0.3 تكوين `docker-compose.yml` المحدّث
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: ummah_postgres
    restart: always
    environment:
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
      POSTGRES_DB: ${DB_NAME:-ummah_db}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: ummah_redis
    restart: always
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-redis_secure_pass}
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD:-redis_secure_pass}", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  clamav:
    image: clamav/clamav:latest
    container_name: ummah_clamav
    restart: always
    ports:
      - "3310:3310"
    volumes:
      - clamav_db:/var/lib/clamav
    healthcheck:
      test: ["CMD-SHELL", "echo PING | nc -w 2 127.0.0.1 3310 | grep -q PONG"]
      interval: 10s
      timeout: 5s
      retries: 6

volumes:
  postgres_data:
  redis_data:
  clamav_db:
```

#### 0.4 ثوابت المشروع الجديدة `src/common/constants/limits.constant.ts`
```typescript
export const LIMITS = {
  // ثوابت V1
  POST_TEXT_MAX_LENGTH: 2000,
  FEED_DEFAULT_LIMIT: 20,
  FEED_MAX_LIMIT: 50,
  DISPLAY_NAME_MAX_LENGTH: 50,
  BIO_MAX_LENGTH: 160,

  // ثوابت V2: المجموعات والمحادثات
  GROUP_MAX_MEMBERS: 256,
  GROUP_TITLE_MAX: 100,
  GROUP_DESCRIPTION_MAX: 500,
  CHAT_TEXT_MAX: 4000,
  CHAT_CAPTION_MAX: 1024,
  EDIT_WINDOW_MINUTES: 15,
  READ_RECEIPT_MAX_MEMBERS: 32,
  HISTORY_PAGE_MAX: 100,
  GROUP_CREATION_RATE_PER_DAY: 10,
  JOIN_REQUESTS_RATE_PER_MIN: 5,

  // ثوابت الوسائط والملفات
  CHAT_IMAGE_MAX_BYTES: 5 * 1024 * 1024,        // 5 MB
  CHAT_VIDEO_MAX_BYTES: 50 * 1024 * 1024,       // 50 MB
  CHAT_VIDEO_MAX_SECONDS: 60,
  CHAT_FILE_MAX_BYTES: 100 * 1024 * 1024,       // 100 MB
  VOICE_MAX_BYTES: 10 * 1024 * 1024,            // 10 MB
  VOICE_MAX_SECONDS: 300,                       // 5 minutes
  PRESIGN_GET_EXPIRES_SECONDS: 300,             // 5 minutes
  PRESIGN_PUT_EXPIRES_SECONDS: 300,

  // ثوابت المكالمات الصوتية
  CALL_MAX_PARTICIPANTS: 8,
  CALL_RING_TIMEOUT_SECONDS: 45,
  CALL_GROUP_MAX_MEMBERS: 32,
  LIVEKIT_TOKEN_TTL_SECONDS: 120,

  // ثوابت التعليقات
  COMMENT_TEXT_MAX_LENGTH: 1000,
  COMMENTS_DEFAULT_LIMIT: 20,
  COMMENTS_MAX_LIMIT: 50,
} as const;
```

#### 0.5 تحديث التحقق من البيئة `src/config/env.validation.ts`
إضافة المتغيرات الإلزامية:
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `CLAMAV_HOST`, `CLAMAV_PORT`
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- `CHAT_STORAGE_BUCKET` (خاص ومفصول عن وسائط البوستات)
- `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`

---

### المرحلة 1: مخطط قاعدة البيانات الموسّع وترحيل Prisma (Prisma Schema & Migrations V2)

#### 1.1 الهدف والنطاق
توسيع مخطط `prisma/schema.prisma` ليشمل كل نماذج V2 (المحادثات، الأعضاء، الرسائل، المرفقات، المكالمات، الأجهزة، البلاغات، طلبات الانضمام، والمحظورين) بالإضافة لنموذج التعليقات `Comment`، مع إضافة حقل `globalRole` للمستخدمين وحقل `groupId` للمنشورات كبنية جاهزة للتوسع المستقبلي دون كسر جداول V1 الحالية.

#### 1.2 كود المخطط الكامل `prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ──────────────────────────────────────────
// V1 & Foundation Enums
// ──────────────────────────────────────────

enum UserStatus {
  ACTIVE
  SUSPENDED
}

enum GlobalRole {
  USER
  ADMIN
  SUPER_ADMIN
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

// ──────────────────────────────────────────
// V2 New Enums
// ──────────────────────────────────────────

enum ConversationType {
  DIRECT
  GROUP
}

enum GroupPrivacy {
  PUBLIC       // عامة: قابلة للاكتشاف، محادثاتها محجوبة لغير الأعضاء، انضمام مباشر
  PRIVATE      // خاصة: بالطلب أو رابط دعوة فقط
  SECRET       // سرية وخفية (Stealth): 404 لغير الأعضاء، لا تظهر بأي بحث، بالإضافة الحصرية
}

enum MemberRole {
  OWNER
  ADMIN
  MEMBER
}

enum JoinRequestStatus {
  PENDING
  APPROVED
  REJECTED
}

enum MessageType {
  TEXT
  IMAGE
  VIDEO
  FILE
  VOICE
  SYSTEM
}

enum AttachmentStatus {
  PENDING
  READY
  REJECTED
  DELETED
}

enum CallStatus {
  RINGING
  ACTIVE
  ENDED
  MISSED
  DECLINED
  CANCELED
}

enum PushProvider {
  FCM
  APNS_VOIP
}

enum DevicePlatform {
  IOS
  ANDROID
  WEB
}

enum CommentStatus {
  ACTIVE
  DELETED
}

// ──────────────────────────────────────────
// Core User Model (Updated with V2 Relations)
// ──────────────────────────────────────────

model User {
  id          String     @id @default(uuid())
  firebaseUid String     @unique @db.VarChar(128)
  displayName String     @db.VarChar(50)
  bio         String?    @db.VarChar(160)
  avatarKey   String?    @db.VarChar(512)
  status      UserStatus @default(ACTIVE)
  globalRole  GlobalRole @default(USER)
  reportCount Int        @default(0)
  createdAt   DateTime   @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime   @updatedAt @db.Timestamptz(3)

  // علاقات V1
  posts                Post[]
  reportsMade          Report[]               @relation("ReportsMade")

  // علاقات التعليقات [NEW]
  comments             Comment[]

  // علاقات V2 المراسلات والمجموعات [NEW]
  conversationsCreated Conversation[]         @relation("ConversationCreator")
  memberships          ConversationMember[]
  messagesSent         Message[]              @relation("MessageSender")
  messageReports       MessageReport[]        @relation("MessageReporter")
  blocksMade           UserBlock[]            @relation("Blocker")
  blocksReceived       UserBlock[]            @relation("Blocked")
  pushTokens           PushToken[]
  callsStarted         Call[]                 @relation("CallInitiator")
  callParticipations   CallParticipant[]
  joinRequestsMade     GroupJoinRequest[]     @relation("JoinRequestsMade")
  bannedInGroups       GroupBannedMember[]    @relation("BannedUser")

  @@map("users")
}

// ──────────────────────────────────────────
// Post & Comment Models (V1 Updated & V2 Comments)
// ──────────────────────────────────────────

model Post {
  id            String      @id @default(uuid())
  authorId      String
  author        User        @relation(fields: [authorId], references: [id], onDelete: Restrict)
  groupId       String?     // جاهز لربط المنشورات بمجموعات اجتماعية مستقبلاً
  text          String?     @db.VarChar(2000)
  status        PostStatus  @default(ACTIVE)
  reportCount   Int         @default(0)
  commentsCount Int         @default(0)
  createdAt     DateTime    @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime    @updatedAt @db.Timestamptz(3)

  media         PostMedia[]
  reports       Report[]
  comments      Comment[]

  @@index([status, createdAt(sort: Desc), id(sort: Desc), authorId])
  @@index([authorId, createdAt(sort: Desc), id(sort: Desc)])
  @@index([groupId, status, createdAt(sort: Desc)])
  @@map("posts")
}

model PostMedia {
  id        String    @id @default(uuid())
  postId    String
  post      Post      @relation(fields: [postId], references: [id], onDelete: Cascade)
  key       String    @unique @db.VarChar(512)
  type      MediaType
  position  Int
  createdAt DateTime  @default(now()) @db.Timestamptz(3)

  @@unique([postId, position])
  @@map("post_media")
}

model Comment {
  id        String        @id @default(uuid())
  postId    String
  post      Post          @relation(fields: [postId], references: [id], onDelete: Cascade)
  authorId  String
  author    User          @relation(fields: [authorId], references: [id], onDelete: Restrict)
  text      String        @db.VarChar(1000)
  status    CommentStatus @default(ACTIVE)
  createdAt DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt DateTime      @updatedAt @db.Timestamptz(3)

  @@index([postId, status, createdAt(sort: Desc), id(sort: Desc)])
  @@map("comments")
}

model Report {
  id         String       @id @default(uuid())
  postId     String
  post       Post         @relation(fields: [postId], references: [id], onDelete: Cascade)
  reporterId String
  reporter   User         @relation("ReportsMade", fields: [reporterId], references: [id], onDelete: Restrict)
  reason     ReportReason
  createdAt  DateTime     @default(now()) @db.Timestamptz(3)

  @@unique([postId, reporterId])
  @@map("reports")
}

// ──────────────────────────────────────────
// V2 Conversations & Groups Models
// ──────────────────────────────────────────

model Conversation {
  id                  String             @id @default(uuid())
  type                ConversationType
  privacy             GroupPrivacy       @default(PRIVATE)
  directKey           String?            @unique            // DIRECT: `${minUserId}:${maxUserId}`
  title               String?            @db.VarChar(100)   // GROUP
  description         String?            @db.VarChar(500)   // GROUP
  avatarKey           String?            @db.VarChar(255)   // GROUP (chat/...)
  inviteCode          String?            @unique @db.VarChar(64) // كود رابط الدعوة المشفر
  inviteEnabled       Boolean            @default(true)
  isAnnouncementsOnly Boolean            @default(false)    // وضع النشر للمشرفين فقط
  createdById         String
  lastSeq             Int                @default(0)        // عداد الرسائل المتسلسل الذري
  lastMessageAt       DateTime?          @db.Timestamptz(3)
  createdAt           DateTime           @default(now()) @db.Timestamptz(3)
  updatedAt           DateTime           @updatedAt @db.Timestamptz(3)

  createdBy           User               @relation("ConversationCreator", fields: [createdById], references: [id], onDelete: Restrict)
  members             ConversationMember[]
  messages            Message[]
  calls               Call[]
  joinRequests        GroupJoinRequest[]
  bannedMembers       GroupBannedMember[]

  @@index([type, privacy, lastMessageAt(sort: Desc)])
  @@map("conversations")
}

model ConversationMember {
  conversationId String
  userId         String
  role           MemberRole @default(MEMBER)
  joinedSeq      Int                          // الرسائل المقروءة: seq > joinedSeq
  lastReadSeq    Int                          // إيصال القراءة
  mutedUntil     DateTime?          @db.Timestamptz(3)
  joinedAt       DateTime   @default(now()) @db.Timestamptz(3)

  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@id([conversationId, userId])
  @@index([userId, joinedAt(sort: Desc)])
  @@map("conversation_members")
}

model GroupJoinRequest {
  id             String            @id @default(uuid())
  conversationId String
  userId         String
  status         JoinRequestStatus @default(PENDING)
  reviewedById   String?
  createdAt      DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime          @updatedAt @db.Timestamptz(3)

  conversation   Conversation      @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user           User              @relation("JoinRequestsMade", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([conversationId, userId])
  @@index([conversationId, status, createdAt(sort: Asc)])
  @@map("group_join_requests")
}

model GroupBannedMember {
  conversationId String
  userId         String
  bannedById     String
  reason         String?           @db.VarChar(255)
  createdAt      DateTime          @default(now()) @db.Timestamptz(3)

  conversation   Conversation      @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user           User              @relation("BannedUser", fields: [userId], references: [id], onDelete: Cascade)

  @@id([conversationId, userId])
  @@map("group_banned_members")
}

// ──────────────────────────────────────────
// V2 Messages & Attachments Models
// ──────────────────────────────────────────

model Message {
  id             String          @id @default(uuid())
  conversationId String
  seq            Int
  senderId       String?                       // null للرسائل النظامية SYSTEM
  clientMsgId    String?         @db.VarChar(36)
  type           MessageType
  text           String?         @db.Text
  replyToId      String?
  systemPayload  Json?                         // تفاصيل رسائل النظام
  editedAt       DateTime?       @db.Timestamptz(3)
  deletedAt      DateTime?       @db.Timestamptz(3)
  createdAt      DateTime        @default(now()) @db.Timestamptz(3)

  conversation   Conversation    @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender         User?           @relation("MessageSender", fields: [senderId], references: [id], onDelete: Restrict)
  replyTo        Message?        @relation("Replies", fields: [replyToId], references: [id], onDelete: SetNull)
  replies        Message[]       @relation("Replies")
  attachment     Attachment?
  reports        MessageReport[]

  @@unique([conversationId, seq])
  @@unique([conversationId, senderId, clientMsgId])
  @@index([conversationId, seq(sort: Desc)])
  @@map("messages")
}

model Attachment {
  id              String           @id @default(uuid())
  messageId       String           @unique
  uploaderId      String
  key             String           @unique @db.VarChar(255) // chat/{convId}/{userId}/{uuid}.{ext}
  kind            MessageType
  contentType     String           @db.VarChar(100)
  sizeBytes       Int
  durationSeconds Int?
  waveform        Json?
  fileName        String?          @db.VarChar(120)
  status          AttachmentStatus @default(PENDING)
  scannedAt       DateTime?        @db.Timestamptz(3)
  createdAt       DateTime         @default(now()) @db.Timestamptz(3)

  message         Message          @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([status, createdAt])
  @@map("attachments")
}

model MessageReport {
  id                    String       @id @default(uuid())
  messageId             String
  reporterId            String
  reason                ReportReason
  snapshotText          String?      @db.Text
  snapshotAttachmentKey String?      @db.VarChar(255)
  createdAt             DateTime     @default(now()) @db.Timestamptz(3)

  message               Message      @relation(fields: [messageId], references: [id], onDelete: Cascade)
  reporter              User         @relation("MessageReporter", fields: [reporterId], references: [id], onDelete: Restrict)

  @@unique([messageId, reporterId])
  @@map("message_reports")
}

// ──────────────────────────────────────────
// V2 Moderation, Devices, & Calls Models
// ──────────────────────────────────────────

model UserBlock {
  blockerId String
  blockedId String
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  blocker   User     @relation("Blocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked   User     @relation("Blocked", fields: [blockedId], references: [id], onDelete: Cascade)

  @@id([blockerId, blockedId])
  @@index([blockedId])
  @@map("user_blocks")
}

model PushToken {
  id         String         @id @default(uuid())
  userId     String
  provider   PushProvider
  platform   DevicePlatform
  token      String         @unique @db.VarChar(512)
  createdAt  DateTime       @default(now()) @db.Timestamptz(3)
  lastSeenAt DateTime       @default(now()) @db.Timestamptz(3)

  user       User           @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("push_tokens")
}

model Call {
  id             String            @id @default(uuid())
  conversationId String
  initiatorId    String
  status         CallStatus        @default(RINGING)
  livekitRoom    String            @unique // call_{id}
  createdAt      DateTime          @default(now()) @db.Timestamptz(3)
  answeredAt     DateTime?         @db.Timestamptz(3)
  endedAt        DateTime?         @db.Timestamptz(3)

  conversation   Conversation      @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  initiator      User              @relation("CallInitiator", fields: [initiatorId], references: [id], onDelete: Restrict)
  participants   CallParticipant[]

  @@index([conversationId, createdAt(sort: Desc)])
  @@index([status])
  @@map("calls")
}

model CallParticipant {
  callId     String
  userId     String
  joinedAt   DateTime? @db.Timestamptz(3)
  leftAt     DateTime? @db.Timestamptz(3)
  declinedAt DateTime? @db.Timestamptz(3)

  call       Call      @relation(fields: [callId], references: [id], onDelete: Cascade)
  user       User      @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@id([callId, userId])
  @@index([userId, leftAt])
  @@map("call_participants")
}
```

#### 1.3 أمر إنشاء الـ Migration
```bash
npx prisma migrate dev --name backend_v2_features
```

---

### المرحلة 2: وحدة التعليقات على المنشورات (Comments Module & Post Integration)

#### 2.1 الهدف والنطاق
تنفيذ ميزة التعليقات على المنشورات مع:
- تطهير النص المدخل عبر `sanitizeText` لمنع ثغرات XSS.
- تحديث ذري داخل Transaction لعداد `commentsCount` على المنشور.
- تصفح التعليقات بتقنية Cursor-based Pagination فائقة السرعة مع ترتيب زمني تنازلي.
- التحقق الصارم من حالة المنشور (`ACTIVE` فقط).
- حصر صلاحية الحذف على كاتب التعليق نفسه أو صاحب المنشور الأصلي.

#### 2.2 مواصفات الـ DTO والتحقق `src/modules/comments/dto/create-comment.dto.ts`
```typescript
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { sanitizeText } from '../../../common/utils/sanitizer.util';
import { LIMITS } from '../../../common/constants/limits.constant';

export class CreateCommentDto {
  @Transform(({ value }) => sanitizeText(value))
  @IsString()
  @IsNotEmpty({ message: 'Comment text cannot be empty' })
  @MaxLength(LIMITS.COMMENT_TEXT_MAX_LENGTH, {
    message: `Comment text must not exceed ${LIMITS.COMMENT_TEXT_MAX_LENGTH} characters`,
  })
  text!: string;
}
```

#### 2.3 منطق الخدمة `src/modules/comments/comments.service.ts`
```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { LIMITS } from '../../common/constants/limits.constant';
import { decodeCursor, encodeCursor } from '../../common/utils/cursor.util';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createComment(postId: string, userId: string, dto: CreateCommentDto) {
    return this.prisma.$transaction(async (tx) => {
      // 1. التحقق من وجود المنشور وحالته
      const post = await tx.post.findFirst({
        where: { id: postId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!post) {
        throw new AppException(404, 'POST_NOT_FOUND', 'Post not found or unavailable');
      }

      // 2. التحقق من حالة المستخدم
      const user = await tx.user.findFirst({
        where: { id: userId, status: 'ACTIVE' },
        select: { id: true, displayName: true, avatarKey: true },
      });
      if (!user) {
        throw new AppException(403, 'ACCOUNT_SUSPENDED', 'Account is suspended');
      }

      // 3. إنشاء التعليق وتحديث عداد المنشور ذرياً
      const comment = await tx.comment.create({
        data: {
          postId,
          authorId: userId,
          text: dto.text,
          status: 'ACTIVE',
        },
        include: {
          author: {
            select: { id: true, displayName: true, avatarKey: true },
          },
        },
      });

      await tx.post.update({
        where: { id: postId },
        data: { commentsCount: { increment: 1 } },
      });

      return {
        id: comment.id,
        postId: comment.postId,
        text: comment.text,
        createdAt: comment.createdAt.toISOString(),
        author: {
          id: comment.author.id,
          displayName: comment.author.displayName,
          avatarKey: comment.author.avatarKey,
        },
      };
    });
  }

  async getComments(postId: string, cursor?: string, limitStr?: string) {
    const limit = Math.min(
      Math.max(parseInt(limitStr || '20', 10) || LIMITS.COMMENTS_DEFAULT_LIMIT, 1),
      LIMITS.COMMENTS_MAX_LIMIT,
    );

    // التحقق من أن المنشور نشط
    const post = await this.prisma.post.findFirst({
      where: { id: postId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!post) {
      throw new AppException(404, 'POST_NOT_FOUND', 'Post not found or unavailable');
    }

    const cursorObj = cursor ? decodeCursor(cursor) : null;

    const items = await this.prisma.comment.findMany({
      where: {
        postId,
        status: 'ACTIVE',
        ...(cursorObj
          ? {
              OR: [
                { createdAt: { lt: new Date(cursorObj.t) } },
                {
                  createdAt: new Date(cursorObj.t),
                  id: { lt: cursorObj.i },
                },
              ],
            }
          : {}),
      },
      take: limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        author: {
          select: { id: true, displayName: true, avatarKey: true },
        },
      },
    });

    const hasMore = items.length > limit;
    const records = hasMore ? items.slice(0, limit) : items;

    const nextCursor =
      hasMore && records.length > 0
        ? encodeCursor(
            records[records.length - 1].createdAt.toISOString(),
            records[records.length - 1].id,
          )
        : null;

    return {
      items: records.map((c) => ({
        id: c.id,
        postId: c.postId,
        text: c.text,
        createdAt: c.createdAt.toISOString(),
        author: {
          id: c.author.id,
          displayName: c.author.displayName,
          avatarKey: c.author.avatarKey,
        },
      })),
      nextCursor,
      hasMore,
    };
  }

  async deleteComment(postId: string, commentId: string, userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.findUnique({
        where: { id: commentId },
        include: { post: { select: { id: true, authorId: true } } },
      });

      if (!comment || comment.postId !== postId || comment.status !== 'ACTIVE') {
        throw new AppException(404, 'COMMENT_NOT_FOUND', 'Comment not found');
      }

      // صلاحية الحذف: كاتب التعليق أو صاحب المنشور فقط
      const isCommentAuthor = comment.authorId === userId;
      const isPostAuthor = comment.post.authorId === userId;

      if (!isCommentAuthor && !isPostAuthor) {
        throw new AppException(403, 'FORBIDDEN', 'You do not have permission to delete this comment');
      }

      await tx.comment.update({
        where: { id: commentId },
        data: { status: 'DELETED' },
      });

      await tx.post.update({
        where: { id: postId },
        data: { commentsCount: { decrement: 1 } },
      });
    });
  }
}
```

#### 2.4 المتحكم `src/modules/comments/comments.controller.ts`
```typescript
import { Controller, Post, Get, Delete, Param, Body, Query, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('posts/:postId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('postId', ParseUUIDPipe) postId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.createComment(postId, userId, dto);
  }

  @Get()
  async findAll(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.commentsService.getComments(postId, cursor, limit);
  }

  @Delete(':commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('postId', ParseUUIDPipe) postId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.commentsService.deleteComment(postId, commentId, userId);
  }
}
```

---

### المرحلة 3: الحظر وإدارة الأجهزة (User Blocks & Devices Module)

#### 3.1 الهدف والنطاق
1. مسارات حظر وفك حظر المستخدمين `POST /blocks/:userId` و `DELETE /blocks/:userId` و `GET /blocks`.
2. منع الحظر المتبادل في مسارات الشات الفردي والمكالمات.
3. تسجيل الأجهزة وإدارتها `POST /devices` و `DELETE /devices` لدعم إشعارات FCM و APNs VoIP.
4. إعداد قناة Redis pub/sub باسم `user.suspended` لقطع جلسات الموقوفين في التو واللحظة.

---

### المرحلة 4: إدارة المحادثات والمجموعات المتقدمة (Conversations, Groups, Privacy Tiers & RBAC)

#### 4.1 الهدف والنطاق
1. دعم إنشاء المحادثات الثنائية مع منع التكرار عبر `directKey = min(u1, u2):max(u1, u2)`.
2. دعم مستويات خصوصية المجموعات الثلاثية:
   - `PUBLIC`: انضمام مباشر أو برابط.
   - `PRIVATE`: طلب انضمام معتمد من المشرف، أو رابط دعوة موثق.
   - `SECRET`: خفية تماماً، لا تظهر بأي نتائج بحث، والاستعلام عنها لغير العضو يعطي `404 CONVERSATION_NOT_FOUND`، والانضمام عبر الإضافة المباشرة من المشرف فقط.
3. مصفوفة الصلاحيات (RBAC):
   - تعيين مشرفين وتنزيل رتبهم (`PATCH /conversations/:id/members/:userId`).
   - نقل الملكية (`POST /conversations/:id/transfer-ownership`).
   - منع خروج المالك قبل نقل الملكية أو حذف المجموعة.
   - وضع "المشرفين فقط يكتبون" (`isAnnouncementsOnly`).
4. روابط الدعوة القابلة للإلغاء والتدوير (`inviteCode`, `inviteEnabled`).
5. طلبات الانضمام (`GroupJoinRequest`) وقائمة المطرودين (`GroupBannedMember`).

#### 4.2 مسارات وحدة المحادثات الكاملة (Endpoints Specifications)
- `POST /conversations/direct` — إنشاء أو جلب محادثة فردية.
- `POST /conversations/groups` — إنشاء مجموعة مع تحديد الخصوصية (`PUBLIC`, `PRIVATE`, `SECRET`).
- `GET /conversations` — جلب محادثات المستخدم بـ Keyset pagination مع كتم الصوت وعدد غير المقروء `unreadCount`.
- `GET /conversations/:id` — تفاصيل المحادثة (مع إرجاع `404` الصارم للمجموعات السرية لغير الأعضاء).
- `PATCH /conversations/:id` — تعديل العنوان، الصورة، الوصف، أو وضع الإعلانات (المشرفين فقط).
- `POST /conversations/:id/members` — إضافة أعضاء مباشر (مع التحقق من الحظر والحد الأقصى 256).
- `DELETE /conversations/:id/members/:userId` — طرد عضو أو مغادرة (مع منع خروج المالك بدون بديل).
- `PATCH /conversations/:id/members/:userId` — ترقية/تنزيل مشرف (المالك فقط).
- `POST /conversations/:id/transfer-ownership` — نقل الملكية لمشرف آخر (المالك فقط).
- `POST /conversations/:id/invite-link/revoke` — تدوير وإلغاء رابط الدعوة السابق.
- `POST /conversations/join/:inviteCode` — الانضمام لمجموعة عبر رابط الدعوة.
- `POST /conversations/:id/join-requests` — إرسال طلب انضمام لمجموعة خاصة.
- `GET /conversations/:id/join-requests` — استعراض طلبات الانضمام المعلقة (المشرفون فقط).
- `POST /conversations/:id/join-requests/:requestId/approve` — قبول الطلب وتوليد العضوية.
- `POST /conversations/:id/join-requests/:requestId/reject` — رفض الطلب.

---

### المرحلة 5: المراسلة النصية، محرك التسلسل، وعدم التكرار (Messages Engine & Idempotency)

#### 5.1 خوارزمية الإرسال والتسلسل الذري (Atomic Sequencing Algorithm)
```typescript
async sendMessage(userId: string, conversationId: string, dto: SendMessageDto): Promise<MessageDto> {
  // فحص معدل الإرسال (Rate Limiting via Redis Token Bucket)
  await this.checkRateLimit('message.send', userId);

  // إذا كان إرسال مرفق، يتم التحقق الأولي خارج الـ Transaction لتقليل وقت القفل
  const attachmentMeta = dto.type !== 'TEXT' 
    ? await this.chatMediaService.verifyAttachmentUpload(userId, conversationId, dto)
    : null;

  const { message, isNew } = await this.prisma.$transaction(async (tx) => {
    // 1. فحص العضوية الصارم
    const membership = await tx.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      include: { conversation: true },
    });
    if (!membership) {
      throw new AppException(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
    }

    // 2. فحص وضع الإعلانات (Announcements Only)
    if (membership.conversation.isAnnouncementsOnly && membership.role === 'MEMBER') {
      throw new AppException(403, 'ANNOUNCEMENTS_ONLY', 'Only admins can send messages in this group');
    }

    // 3. التحقق من عدم التكرار (Idempotency Check)
    const existing = await tx.message.findUnique({
      where: {
        conversationId_senderId_clientMsgId: {
          conversationId,
          senderId: userId,
          clientMsgId: dto.clientMsgId,
        },
      },
      include: MESSAGE_INCLUDE_QUERY,
    });
    if (existing) {
      return { message: existing, isNew: false };
    }

    // 4. فحص الحظر في المحادثات الثنائية (DIRECT)
    if (membership.conversation.type === 'DIRECT') {
      const other = await tx.conversationMember.findFirst({
        where: { conversationId, userId: { not: userId } },
      });
      if (other) {
        const isBlocked = await tx.userBlock.findFirst({
          where: {
            OR: [
              { blockerId: userId, blockedId: other.userId },
              { blockerId: other.userId, blockedId: userId },
            ],
          },
        });
        if (isBlocked) {
          throw new AppException(403, 'BLOCKED', 'Action not allowed between these users');
        }
      }
    }

    // 5. زيادة العداد الذري وقفل الصف (Atomic Seq Increment)
    const updatedConv = await tx.conversation.update({
      where: { id: conversationId },
      data: {
        lastSeq: { increment: 1 },
        lastMessageAt: new Date(),
      },
      select: { lastSeq: true },
    });

    const newSeq = updatedConv.lastSeq;

    // 6. إنشاء سجل الرسالة في قاعدة البيانات
    const createdMsg = await tx.message.create({
      data: {
        conversationId,
        seq: newSeq,
        senderId: userId,
        clientMsgId: dto.clientMsgId,
        type: dto.type,
        text: dto.text || null,
        replyToId: dto.replyToId || null,
        attachment: attachmentMeta ? {
          create: {
            uploaderId: userId,
            key: attachmentMeta.key,
            kind: dto.type,
            contentType: attachmentMeta.contentType,
            sizeBytes: attachmentMeta.sizeBytes,
            durationSeconds: dto.durationSeconds || null,
            waveform: dto.waveform ? JSON.stringify(dto.waveform) : undefined,
            fileName: dto.fileName || null,
            status: 'PENDING',
          },
        } : undefined,
      },
      include: MESSAGE_INCLUDE_QUERY,
    });

    // 7. تحديث إيصال القراءة للمرسل تلقائياً
    await tx.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadSeq: newSeq },
    });

    return { message: createdMsg, isNew: true };
  });

  // 8. بعد اكتمال الـ COMMIT فقط: البث اللحظي وإطلاق الطوابير
  if (isNew) {
    const formattedDto = this.formatMessageDto(message);
    
    // بث للغرفة
    this.realtimeService.emitToConversation(conversationId, 'message.new', formattedDto);

    // إضافة مهمة الإشعار للطابور (للأعضاء غير المتصلين وغير المكتومين)
    await this.queuesService.pushQueue.add('send-push', {
      conversationId,
      messageId: message.id,
      senderId: userId,
    });

    // إذا وُجد مرفق: إرسال أمر الفحص لطابور ClamAV
    if (message.attachment) {
      await this.queuesService.scanQueue.add(
        'scan-attachment',
        { attachmentId: message.attachment.id },
        { attempts: 5, backoff: { type: 'exponential', delay: 5000 } },
      );
    }
  }

  return this.formatMessageDto(message);
}
```

---

### المرحلة 6: بوابة الزمن الفعلي ومقبس الويب (Realtime WebSocket Gateway & Redis Adapter)

#### 6.1 مسار المصادقة وإدارة الجلسات في Socket.IO (Namespace: `/chat`)
1. **الـ Handshake ومطابقة التوكن:**
   ```typescript
   io.of('/chat').use(async (socket, next) => {
     try {
       const token = socket.handshake.auth?.token;
       if (!token) return next(new Error('AUTHENTICATION_REQUIRED'));

       const decoded = await firebaseAuthService.verifyToken(token, true);
       const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });

       if (!user || user.status === 'SUSPENDED') {
         return next(new Error('ACCOUNT_SUSPENDED'));
       }

       socket.data = {
         userId: user.id,
         tokenExp: decoded.exp,
       };
       return next();
     } catch (err) {
       return next(new Error('INVALID_TOKEN'));
     }
   });
   ```
2. **انضمام الغرف التلقائي المقفل:**
   عند الاتصال الناجح:
   - `socket.join('user:' + userId)` (لتلقي المكالمات والإشعارات الشخصية).
   - جلب أحدث 1,000 محادثة ينتمي إليها المستخدم فعلياً وعمل `socket.join('conv:' + id)` داخلياً فقط.
   - منع العميل من إرسال طلب انضمام لغرفة عشوائية من جهته؛ الانضمام محكوم بقاعدة البيانات حصراً.
3. **قطع الاتصال اللحظي للحسابات الموقوفة (`user.suspended`):**
   استماع مستمر لقناة Redis Pub/Sub:
   ```typescript
   redisSubscriber.subscribe('user.suspended', (userId) => {
     chatGateway.server.in(`user:${userId}`).disconnectSockets(true);
   });
   ```
4. **عداد التواجد الداخلي (`presence:{userId}`):**
   - زيادة العداد `INCR` عند الاتصال ونقصانه `DECR` عند قطع الاتصال مع `EXPIRE 120s`.
   - يستخدم فقط داخلياً لقرار إرسال إشعار الدفع (المتصل في المحادثة لا يزعجه إشعار Push).

---

### المرحلة 7: مرفقات الشات والتخزين الخاص وفحص الفيروسات (Chat Media & ClamAV Pipeline)

#### 7.1 الحماية الصارمة للمرفقات
- مفاتيح التخزين تتبع صيغة مشددة:
  `chat/{conversationId}/{userId}/{uuid}.{ext}`
- الامتدادات وأنواع MIME محصورة بدقة (لا SVG، لا HTML، لا Executables).
- الروابط كلها موقعة ومؤقتة:
  - **Presigned PUT:** لرفع الملف خلال 5 دقائق بحجم ونوع مقفلين في توقيع S3/R2.
  - **Presigned GET:** لتحميل الملف بصلاحية 5 دقائق (`PRESIGN_GET_EXPIRES_SECONDS = 300`)، ولا تُصدر إلا لعضو نشط داخل نفس المحادثة.

#### 7.2 معالج فحص الفيروسات في المعالج الخلفي `src/queues/processors/scan.processor.ts`
```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import NodeClam from 'clamscan';

@Processor('scan')
export class ScanProcessor extends WorkerHost {
  private clamscan!: NodeClam;

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Client,
  ) {
    super();
    this.initClam();
  }

  private async initClam() {
    this.clamscan = await new NodeClam().init({
      clamdscan: {
        host: process.env.CLAMAV_HOST || 'clamav',
        port: parseInt(process.env.CLAMAV_PORT || '3310', 10),
        timeout: 60000,
      },
    });
  }

  async process(job: Job<{ attachmentId: string }>): Promise<void> {
    const { attachmentId } = job.data;
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment || attachment.status !== 'PENDING') return;

    // استخراج Stream من S3/R2 دون تحميل كامل الملف للذاكرة
    const s3Response = await this.s3.send(
      new GetObjectCommand({
        Bucket: process.env.CHAT_STORAGE_BUCKET,
        Key: attachment.key,
      }),
    );

    const stream = s3Response.Body as Readable;

    // فحص الفيروسات عبر TCP Streaming
    const { isInfected, viruses } = await this.clamscan.scanStream(stream);

    if (!isInfected) {
      // ملف سليم -> تحويل الحالة إلى READY
      await this.prisma.attachment.update({
        where: { id: attachment.id },
        data: { status: 'READY', scannedAt: new Date() },
      });
    } else {
      // ملف مصاب -> Fail-Closed: تحويل الحالة إلى REJECTED وحذف محتوى الرسالة والكائن فوراً
      await this.prisma.$transaction([
        this.prisma.attachment.update({
          where: { id: attachment.id },
          data: { status: 'REJECTED', scannedAt: new Date() },
        }),
        this.prisma.message.update({
          where: { id: attachment.messageId },
          data: { deletedAt: new Date(), text: null },
        }),
      ]);

      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: process.env.CHAT_STORAGE_BUCKET,
          Key: attachment.key,
        }),
      );
    }
  }
}
```

---

### المرحلة 8: طوابير إشعارات الدفع (BullMQ Push Notifications Processor)

#### 8.1 معايير الخصوصية في إشعارات الـ Push
- **Zero-Message-Content Invariant:** يُمنع تماماً تضمين نص الرسالة أو أسماء المرفقات في الـ Payload المرسل لشركات الهواتف (Apple / Google).
- حمولة الإشعار تحتوي فقط على:
  ```json
  {
    "type": "NEW_MESSAGE",
    "conversationId": "uuid",
    "messageId": "uuid"
  }
  ```
  ويقوم جهاز العميل عند استلام الإشعار بطلب محتوى الرسالة عبر الاتصال المشفر بالـ API.
- **تصفية المستلمين:**
  - يتم استبعاد المستخدمين المتواجدين حالياً في التطبيق (`presence > 0`).
  - يتم استبعاد المستخدمين الذين كتموا المحادثة (`mutedUntil > now()`).

---

### المرحلة 9: المكالمات الصوتية المشفرة و LiveKit SFU (Calls & E2EE Relay)

#### 9.1 دورة حياة المكالمة (Call State Machine)
```
  [RINGING] ──(انضمام أول مدعو)──► [ACTIVE] ──(مغادرة الجميع)──► [ENDED]
      │                                 
      ├─(إلغاء المبادر)──────────► [CANCELED]
      ├─(رفض الجميع)─────────────► [DECLINED]
      └─(مهلة 45 ثانية)──────────► [MISSED]
```

#### 9.2 قواعد الأمان في المكالمات
1. **تشفير E2EE الإلزامي:**
   المكالمات الصوتية مشفرة طرف لطرف (LiveKit WebRTC E2EE). خوادمنا وخوادم LiveKit تمرر حزم الصوت مشفرة ولا تملك مفتاح فك التشفير.
2. **وسيط تبادل المفاتيح اللحظي (Blind Key Relay):**
   الحدث `call.key` في الـ Gateway يتحقق فقط من أن الطرفين مشاركان نشطان في نفس المكالمة وبحجم حمولة لا يتجاوز 512 بايت، ويمرر المفاتيح المشفرة مباشرة بين أجهزة المستخدمين دون حفظها أو قراءتها.
3. **توكنات LiveKit محدودة الصلاحيات:**
   - مدة الصلاحية: 120 ثانية فقط للاتصال بالغرفة.
   - الصلاحيات: نشر الصوت من الميكروفون فقط، منع نشر الفيديو أو البيانات، ومنع صلاحيات إدارة الغرفة (No Room Admin).

---

### المرحلة 10: حزمة الاختبارات الشاملة، اختبارات التزامن والتراجع (E2E Integration & Stress Suite)

#### 10.1 اختبارات التزامن الإلزامية (Concurrency & Race Conditions)
1. **50 مرسل متزامن لمحادثة واحدة:**
   التأكد من أن ترقيم `seq` متسلسل تصاعدياً من 1 إلى 50 دون أي فجوات ودون أي أرقام مكررة إطلاقاً.
2. **إعادة إرسال نفس `clientMsgId` 10 مرات متزامنة:**
   التأكد من إنشاء رسالة واحدة فقط في قاعدة البيانات واسترجاعها بنجاح مع عدم تكرار البث أو الإشعارات.
3. **حماية المجموعات السرية:**
   التأكد من أن غير العضو يتلقى `404 CONVERSATION_NOT_FOUND` عند استعلامه عن المجموعة أو محاولته إرسال طلب انضمام.
4. **حماية سجل الرسائل القديم:**
   التأكد من أن العضو الجديد لا يستطيع قراءة أي رسالة سابقة لتاريخ انضمامه (`seq <= joinedSeq`).
5. **فحص الفيروسات (Fail-Closed):**
   رفع ملف EICAR التجريبي والتأكد من تحوله إلى `REJECTED` وحذف كائن التخزين، وبقاء الملفات الأخرى معلقة `PENDING` إن توقف محرك ClamAV.
6. **سلامة V1:**
   إعادة تشغيل حزمة اختبارات V1 بالكامل والتأكد من نجاحها بنسبة 100% دون أي تراجع.

---

### المرحلة 11: دليل التشغيل والصيانة والأوامر الإدارية (Operations & Manual Runbook)

#### 11.1 قفل مستخدم يدوي وفصله اللحظي
```sql
UPDATE users SET status = 'SUSPENDED', "updatedAt" = now() WHERE id = :'user_id';
```
```bash
redis-cli PUBLISH user.suspended <user_id>
```

#### 11.2 تنظيف الملفات اليتيمة من S3/R2
سكربت دوري لفحص مفاتيح `chat/*` وحذف الملفات التي مر عليها أكثر من 24 ساعة دون أن تكون مرتبطة بـ `Attachment` نشط أو دليل بلاغ `MessageReport`.

---

## 4. قائمة التحقق النهائية للإطلاق (Definition of Done - DoD)
- [ ] تنفيذ جميع الـ Migrations ونجاح الاتصال بقاعدة البيانات و Redis و ClamAV.
- [ ] نجاح اختبارات وحدة التعليقات `comments` وحساب العدادات بدقة ذرية.
- [ ] تفعيل مستويات خصوصية المجموعات الثلاثية والتأكد من عزل `SECRET`.
- [ ] تفعيل نظام الصلاحيات ونقل الملكية ومنع خروج المالك بدون بديل.
- [ ] التأكد من عدم تسريب أي نصوص رسائل في سجلات الخادم (Pino Redact) أو إشعارات الـ Push.
- [ ] اجتياز كافة اختبارات التزامن الـ 50 Concurrency بنجاح تام.
- [ ] اجتياز حزمة اختبارات V1 السابقة بنسبة 100%.
