# BRD/PRD — Backend V2: Chat, Groups, Voice Notes, Files & Audio Calls

**الحالة:** مسودة للتنفيذ  |  **يمتد من:** Backend V1 (يبقى كما هو بلا تغيير في العقود)  |  **اللغة:** الشرح بالعربية، والمواصفات والكود بالإنجليزية.

> **قاعدة القراءة:** كل ما لم يُذكر هنا يتبع V1 (صيغة الأخطاء `{ statusCode, code, message }`، `AppException`، `ValidationPipe`، تنسيق الـcursor، `sanitizeText`، الـAuthGuard، الـPino logging). أي سلوك غير مذكور = خارج النطاق.

---

## 1. Executive Summary & Scope Boundaries

### 1.1 Project Vision & Philosophy
إضافة طبقة تواصل خاصة فوق V1: محادثات فردية ومجموعات، رسائل صوتية، ملفات ووسائط، ومكالمات صوتية. الأولويات بالترتيب: **(1) الأمان، (2) السرعة، (3) البساطة التشغيلية.** عند التعارض يفوز الأمان ثم السرعة.

### 1.2 In-Scope Features Matrix

| ID | Feature | Phase |
| --- | --- | --- |
| C-01 | محادثة فردية (DIRECT) واحدة فقط لكل زوج مستخدمين | A |
| C-02 | مجموعات (GROUP) حتى 256 عضو، أدوار `OWNER` / `ADMIN` / `MEMBER` | A |
| C-03 | رسائل نصية + الرد على رسالة (reply) | A |
| C-04 | تعديل الرسالة النصية خلال 15 دقيقة، وحذفها (soft) للجميع | A |
| C-05 | إيصالات القراءة (`lastReadSeq`) ومؤشر الكتابة (typing) | A |
| C-06 | حظر المستخدمين (Block) | A |
| C-07 | الإبلاغ عن رسالة (مراجعة يدوية فقط، بدون إجراء تلقائي) | A |
| C-08 | مرفقات: صورة، فيديو، ملف، رسالة صوتية (voice note) | B |
| C-09 | فحص فيروسات إلزامي قبل إتاحة أي مرفق (fail-closed) | B |
| C-10 | إشعارات Push للمحادثات (بدون محتوى الرسالة) | C |
| C-11 | مكالمات صوتية: فردية، وجماعية حتى 8 مشاركين | D |
| C-12 | تشفير E2EE للمكالمات (LiveKit E2EE) | D |

### 1.3 Out-of-Scope (Hard Boundaries)
E2EE للرسائل والملفات • مكالمات فيديو • مشاركة الشاشة • تسجيل المكالمات • بحث في الرسائل • Reactions • Forward • Polls • Pin • رسائل تختفي (disappearing) • الحذف "لي أنا فقط" • حالة الاتصال / آخر ظهور (presence) • القنوات والـbroadcast • Transcription للصوت • البوتات • لوحة Admin (يبقى الـRunbook اليدوي) • الدفع • مجموعات بدون حد أقصى.

### 1.4 Core Architectural Principles
1. **Modular Monolith:** modules جديدة (`conversations`, `messages`, `chat-media`, `realtime`, `calls`, `blocks`, `devices`) داخل نفس الـrepo ونفس الـdeployable. لا microservices.
2. **DB as Source of Truth:** كل حدث يُكتب في PostgreSQL أولًا ثم يُبث. الـRedis للبيانات المؤقتة والـqueues فقط، وفقدانه لا يفقد أي رسالة.
3. **Private by Default:** كل ما في الشات خاص: لا public URLs، ولا فهرسة، وكل قراءة تمر على فحص العضوية.
4. **Fail-Closed:** أي مرفق لا يُقدَّم إلا بعد فحص ناجح؛ فشل الفاحص ⇒ يبقى `PENDING` ولا يُتاح.
5. **Least Data:** الـpush بدون محتوى، واللوج بدون نصوص رسائل، والـtokens قصيرة العمر.
6. **Idempotent & Ordered:** كل إرسال له `clientMsgId`، وكل رسالة لها `seq` متسلسل داخل محادثتها.

### 1.5 Locked Defaults (قيم مثبتة، تُقرأ من env)

| Env Var | Value | | Env Var | Value |
| --- | --- | --- | --- | --- |
| `GROUP_MAX_MEMBERS` | 256 | | `CHAT_TEXT_MAX` | 4000 |
| `GROUP_TITLE_MAX` | 100 | | `CHAT_CAPTION_MAX` | 1024 |
| `EDIT_WINDOW_MINUTES` | 15 | | `READ_RECEIPT_MAX_MEMBERS` | 32 |
| `CHAT_IMAGE_MAX_BYTES` | 5242880 | | `CHAT_VIDEO_MAX_BYTES` | 52428800 |
| `CHAT_VIDEO_MAX_SECONDS` | 60 | | `CHAT_FILE_MAX_BYTES` | 104857600 |
| `VOICE_MAX_BYTES` | 10485760 | | `VOICE_MAX_SECONDS` | 300 |
| `PRESIGN_GET_EXPIRES_SECONDS` | 300 | | `CALL_MAX_PARTICIPANTS` | 8 |
| `CALL_RING_TIMEOUT_SECONDS` | 45 | | `CALL_GROUP_MAX_MEMBERS` | 32 |
| `LIVEKIT_TOKEN_TTL_SECONDS` | 120 | | `HISTORY_PAGE_MAX` | 100 |

**ملاحظة قرار:** المكالمات الجماعية مسموحة فقط في مجموعات حجمها ≤ `CALL_GROUP_MAX_MEMBERS` (32) لأن الرنين يصل لكل الأعضاء. المجموعات الأكبر تبقى للشات فقط.

---

## 2. System Architecture & Technical Stack

### 2.1 Stack Additions (فوق V1)

| Concern | Choice | Justification |
| --- | --- | --- |
| Realtime | `@nestjs/websockets` + `socket.io` (WebSocket transport فقط) | يتكامل مع NestJS Guards والـDTOs |
| Fan-out بين الـinstances | `@socket.io/redis-adapter` + `ioredis` | مطلوب بمجرد وجود أكثر من instance |
| Queues | `bullmq` على نفس Redis (process منفصل `worker.ts` من نفس الـrepo) | push، فحص الفيروسات، مهلة الرنين، التنظيف. **هذا أول استثناء مبرَّر من قاعدة V1 "لا queues"** |
| Throttler storage | `@nest-lab/throttler-storage-redis` | الـin-memory لا يصلح مع أكثر من instance |
| Calls (SFU) | LiveKit (`livekit-server-sdk`) | لا نبني WebRTC infrastructure بأنفسنا |
| Antivirus | ClamAV daemon (`clamd`) عبر TCP `INSTREAM` | فحص بالـstreaming من R2 بدون تحميل كامل للذاكرة |
| Push (Android + رسائل) | Firebase Admin SDK (FCM) | موجود أصلًا في V1 |
| Push (iOS VoIP للمكالمات) | APNs HTTP/2 مباشرة (`apns2`) | الـFCM لا يرسل PushKit/VoIP |
| DB pooling | PgBouncer (transaction mode) | الـWebSocket يضاعف الاتصالات |

### 2.2 Deployment Topology
`api` (HTTP + WS، قابل للتكرار) • `worker` (BullMQ consumers، instance واحدة أو أكثر) • `postgres` • `redis` • `clamd` • `livekit` (region قريب من الـusers: الشرق الأوسط أو فرانكفورت) • R2 bucket **خاص** `chat/*` منفصل عن `media/*` العام. إعدادات الـCloudflare WAF أمام الـAPI.

### 2.3 Module Layout
```
src/
  conversations/   # REST: conversations, members, roles, mute
  messages/        # REST + shared MessagesService.send (يستخدمه الـWS أيضًا)
  chat-media/      # presign PUT + batch presign GET + verify
  realtime/        # ChatGateway, WsAuthMiddleware, presence counters, rate limiter
  calls/           # REST + LiveKit service + webhook + key relay
  blocks/  devices/  moderation-chat/
  queues/          # processors: push, scan, call-timeout, cleanup
  common/          # status-filters، membership.guard، AppException (من V1)
```

### 2.4 Realtime Authentication & Session Flow
1. **Handshake:** `io('/chat', { auth: { token }, transports: ['websocket'] })`. الـmiddleware: `verifyIdToken(token, checkRevoked=true)` ← `upsert` المستخدم (نفس منطق V1) ← إذا `SUSPENDED` يُرفض بخطأ `ACCOUNT_SUSPENDED` ويُقطع الاتصال.
2. **حفظ الجلسة:** `socket.data = { userId, tokenExp }`، و`socket.join('user:{userId}')`، ثم `socket.join('conv:{id}')` لكل محادثة للمستخدم (حد أقصى 1000 الأحدث نشاطًا؛ الباقي يُضاف عند أول تفاعل).
3. **انتهاء الـtoken:** قبل كل event إذا `now > tokenExp` يُرسل السيرفر `auth.expired` ويمهل العميل 30 ثانية لإرسال `auth.refresh { token }` (يُعاد التحقق ويحدَّث `tokenExp`) وإلا يُقطع الاتصال.
4. **حالة الحساب:** كاش داخل الـprocess لحالة المستخدم بمدة 30 ثانية يُفحص قبل كل event، **و**قناة Redis pub/sub باسم `user.suspended` تقطع كل sockets المستخدم فورًا (`io.in('user:{id}').disconnectSockets(true)`) وتنهي مكالماته النشطة.
5. **الـPresence الداخلي (غير مكشوف للعملاء):** `INCR presence:{userId}` عند الاتصال، و`DECR` عند القطع، مع `EXPIRE 120` يُجدَّد بالـping. يُستخدم فقط لقرار إرسال الـpush (اتصال = لا push).

### 2.5 Redis Keys

| Key | Type | TTL | Purpose |
| --- | --- | --- | --- |
| `presence:{userId}` | counter | 120s (يتجدد) | هل المستخدم متصل (للـpush فقط) |
| `rl:{event}:{userId}` | token bucket | حسب القاعدة | rate limit للـWS events |
| `call:{callId}:keys` | hash | حتى نهاية المكالمة + 5 دقائق | حالة توزيع مفاتيح E2EE (معرّفات فقط، لا مفاتيح) |
| Channel `user.suspended` | pub/sub | — | قطع جلسات المقفول |
| Queues `push`, `scan`, `call-timeout`, `cleanup` | BullMQ | — | العمل الخلفي |

### 2.6 تغييرات مطلوبة على V1 (Backward-Compatible)
1. بعد `COMMIT` في Moderation Transaction (V1 §5.3) عند الوصول لـ`SUSPENDED`: `redis.publish('user.suspended', userId)`.
2. `GET /health` يضيف `"redis": "up"` ويفشل بـ503 إذا Redis غير متاح.
3. الـThrottler يتحول لـRedis storage.
4. الـ`AllExceptionsFilter` يضيف `WsExceptionFilter` يحوّل `AppException` لـack بنفس الشكل.
5. Runbook V1 §7.3 يضيف خطوة `PUBLISH` عند القفل اليدوي (انظر §7 هنا).

---

## 3. Production-Ready Database Schema (Prisma — Additions)

migrations إضافية فقط (`prisma migrate`)، ولا تعديل على الجداول الحالية عدا إضافة الـrelations للـ`User` أدناه.

```prisma
// ───────── Enums ─────────
enum ConversationType { DIRECT GROUP }
enum MemberRole       { OWNER ADMIN MEMBER }
enum MessageType      { TEXT IMAGE VIDEO FILE VOICE SYSTEM }
enum AttachmentStatus { PENDING READY REJECTED DELETED }
enum CallStatus       { RINGING ACTIVE ENDED MISSED DECLINED CANCELED }
enum PushProvider     { FCM APNS_VOIP }
enum DevicePlatform   { IOS ANDROID WEB }

// ───────── Additions to existing `User` model ─────────
// conversationsCreated Conversation[]       @relation("ConversationCreator")
// memberships          ConversationMember[]
// messagesSent         Message[]            @relation("MessageSender")
// messageReports       MessageReport[]      @relation("MessageReporter")
// blocksMade           UserBlock[]          @relation("Blocker")
// blocksReceived       UserBlock[]          @relation("Blocked")
// pushTokens           PushToken[]
// callsStarted         Call[]               @relation("CallInitiator")
// callParticipations   CallParticipant[]

model Conversation {
  id            String           @id @default(uuid())
  type          ConversationType
  directKey     String?          @unique            // DIRECT فقط: `${minUserId}:${maxUserId}` (ترتيب نصي)
  title         String?          @db.VarChar(100)   // GROUP فقط
  avatarKey     String?          @db.VarChar(255)   // GROUP فقط (مفتاح chat/…)
  createdById   String
  lastSeq       Int              @default(0)        // عدّاد الرسائل (يُزاد ذريًا)
  lastMessageAt DateTime?
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  createdBy User                 @relation("ConversationCreator", fields: [createdById], references: [id], onDelete: Restrict)
  members   ConversationMember[]
  messages  Message[]
  calls     Call[]
}

model ConversationMember {
  conversationId String
  userId         String
  role           MemberRole @default(MEMBER)
  joinedSeq      Int                          // الرسائل المرئية: seq > joinedSeq
  lastReadSeq    Int                          // يُضبط = joinedSeq عند الإنشاء
  mutedUntil     DateTime?
  joinedAt       DateTime   @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@id([conversationId, userId])
  @@index([userId])
}

model Message {
  id             String      @id @default(uuid())
  conversationId String
  seq            Int
  senderId       String?                       // null = SYSTEM
  clientMsgId    String?     @db.VarChar(36)   // UUID من العميل، null = SYSTEM
  type           MessageType
  text           String?     @db.Text          // أو caption للمرفقات
  replyToId      String?
  systemPayload  Json?                         // {event:'CALL_ENDED'|'MEMBER_ADDED'|..., ...}
  editedAt       DateTime?
  deletedAt      DateTime?
  createdAt      DateTime    @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender       User?        @relation("MessageSender", fields: [senderId], references: [id], onDelete: Restrict)
  replyTo      Message?     @relation("Replies", fields: [replyToId], references: [id], onDelete: SetNull)
  replies      Message[]    @relation("Replies")
  attachment   Attachment?
  reports      MessageReport[]

  @@unique([conversationId, seq])
  @@unique([conversationId, senderId, clientMsgId])   // idempotency (NULLs مسموحة لـSYSTEM)
}

model Attachment {
  id              String           @id @default(uuid())
  messageId       String           @unique
  uploaderId      String
  key             String           @unique @db.VarChar(255)   // chat/{conversationId}/{userId}/{uuid}.{ext}
  kind            MessageType                                  // IMAGE|VIDEO|FILE|VOICE فقط (يُفرض بالتطبيق)
  contentType     String           @db.VarChar(100)
  sizeBytes       Int
  durationSeconds Int?
  waveform        Json?                                        // مصفوفة ≤ 64 رقم (0..255) من العميل
  fileName        String?          @db.VarChar(120)            // اسم معقَّم، للعرض فقط
  status          AttachmentStatus @default(PENDING)
  scannedAt       DateTime?
  createdAt       DateTime         @default(now())

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)

  @@index([status, createdAt])
}

model MessageReport {
  id                    String       @id @default(uuid())
  messageId             String
  reporterId            String
  reason                ReportReason                      // enum موجود من V1
  snapshotText          String?      @db.Text             // نسخة وقت البلاغ (يحمي من الحذف اللاحق)
  snapshotAttachmentKey String?      @db.VarChar(255)
  createdAt             DateTime     @default(now())

  message  Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  reporter User    @relation("MessageReporter", fields: [reporterId], references: [id], onDelete: Restrict)

  @@unique([messageId, reporterId])
}

model UserBlock {
  blockerId String
  blockedId String
  createdAt DateTime @default(now())

  blocker User @relation("Blocker", fields: [blockerId], references: [id], onDelete: Cascade)
  blocked User @relation("Blocked", fields: [blockedId], references: [id], onDelete: Cascade)

  @@id([blockerId, blockedId])
  @@index([blockedId])
}

model PushToken {
  id         String         @id @default(uuid())
  userId     String
  provider   PushProvider
  platform   DevicePlatform
  token      String         @unique @db.VarChar(512)
  createdAt  DateTime       @default(now())
  lastSeenAt DateTime       @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model Call {
  id             String     @id @default(uuid())
  conversationId String
  initiatorId    String
  status         CallStatus @default(RINGING)
  livekitRoom    String     @unique                // = `call_${id}`
  createdAt      DateTime   @default(now())
  answeredAt     DateTime?
  endedAt        DateTime?

  conversation Conversation      @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  initiator    User              @relation("CallInitiator", fields: [initiatorId], references: [id], onDelete: Restrict)
  participants CallParticipant[]

  @@index([conversationId, createdAt(sort: Desc)])
  @@index([status])
}

model CallParticipant {
  callId     String
  userId     String
  joinedAt   DateTime?
  leftAt     DateTime?
  declinedAt DateTime?

  call Call @relation(fields: [callId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Restrict)

  @@id([callId, userId])
  @@index([userId, leftAt])
}
```

**قواعد ثابتة على الـSchema:**
1. `directKey` يضمن محادثة DIRECT واحدة لكل زوج حتى مع الطلبات المتزامنة (`P2002` ⇒ جلب الموجودة).
2. لا حذف فعلي للمستخدمين (`Restrict`) كما في V1.
3. الـIndex الحرج لقراءة السجل هو الـ`@@unique([conversationId, seq])` (يخدم `before/after` مباشرة).
4. مفاتيح `chat/*` لا تُخزَّن في أي عمود مكشوف للعملاء؛ يُرجَع فقط `attachmentId`.

---

## 4. Detailed API Specifications

كل الـendpoints **Mandatory Auth** (ما عدا webhook LiveKit)، وتعمل عليها قاعدة V1: المستخدم `SUSPENDED` ⇒ `403 ACCOUNT_SUSPENDED`. المحادثة التي لا يكون الطالب عضوًا فيها تُرجع **`404 CONVERSATION_NOT_FOUND`** (لا نكشف وجودها).

### 4.0 Shared Types & New Error Codes

```ts
interface UserBriefDto { id: string; displayName: string; avatarUrl: string | null }

interface AttachmentDto {
  id: string; kind: 'IMAGE' | 'VIDEO' | 'FILE' | 'VOICE';
  contentType: string; sizeBytes: number; durationSeconds: number | null;
  waveform: number[] | null; fileName: string | null;
  status: 'PENDING' | 'READY' | 'REJECTED';       // لا url هنا أبدًا (انظر 4.7)
}

interface MessageDto {
  id: string; conversationId: string; seq: number;
  sender: UserBriefDto | null;                     // null = SYSTEM
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'FILE' | 'VOICE' | 'SYSTEM';
  text: string | null;                             // null إذا محذوفة
  replyTo: { id: string; seq: number; senderId: string | null; type: string; textPreview: string | null } | null;
  attachment: AttachmentDto | null;                // null إذا محذوفة
  system: { event: string; [k: string]: unknown } | null;
  editedAt: string | null; deletedAt: string | null; createdAt: string;
}

interface ConversationDto {
  id: string; type: 'DIRECT' | 'GROUP';
  title: string | null; avatarUrl: string | null;  // DIRECT: عنوان وصورة الطرف الآخر
  members: Array<UserBriefDto & { role: 'OWNER' | 'ADMIN' | 'MEMBER' }>;   // في التفاصيل فقط، وليس في القائمة
  memberCount: number; myRole: 'OWNER' | 'ADMIN' | 'MEMBER';
  mutedUntil: string | null; unreadCount: number;
  lastMessage: MessageDto | null; lastMessageAt: string | null;
}
```

`unreadCount = conversation.lastSeq - member.lastReadSeq`. إرسال المستخدم لرسالة يضبط `lastReadSeq` له = `seq` الرسالة.

**أكواد أخطاء جديدة** (تُضاف لجدول V1 §4.0؛ الشكل نفسه):

| status | code | message |
| --- | --- | --- |
| 400 | `EMPTY_MESSAGE` | Message must contain text or an attachment |
| 400 | `INVALID_GROUP` | Group must have between 2 and 256 members |
| 400 | `ATTACHMENT_NOT_UPLOADED` | Attachment file was not uploaded |
| 400 | `INVALID_ATTACHMENT` | Attachment violates type or size limits |
| 403 | `BLOCKED` | Action not allowed between these users |
| 403 | `CANNOT_ADD_MEMBER` | One or more users cannot be added |
| 403 | `NOT_CONVERSATION_ADMIN` | Requires group admin permission |
| 403 | `NOT_CONVERSATION_OWNER` | Requires group owner permission |
| 403 | `NOT_MESSAGE_OWNER` | You can only modify your own messages |
| 403 | `ATTACHMENT_NOT_OWNED` | Attachment key does not belong to the current user |
| 403 | `CALL_NOT_ALLOWED` | Calls are not allowed in this conversation |
| 404 | `CONVERSATION_NOT_FOUND` | Conversation not found |
| 404 | `MESSAGE_NOT_FOUND` | Message not found |
| 404 | `ATTACHMENT_NOT_FOUND` | Attachment not found |
| 404 | `CALL_NOT_FOUND` | Call not found |
| 409 | `MESSAGE_NOT_EDITABLE` | Message can no longer be edited |
| 409 | `ATTACHMENT_PENDING` | Attachment is still being scanned |
| 409 | `CALL_IN_PROGRESS` | A call is already in progress in this conversation |
| 409 | `ALREADY_IN_CALL` | You are already in another call |
| 409 | `CALL_FULL` | Call has reached its participant limit |
| 409 | `CALL_NOT_ACTIVE` | Call has ended |

(`MEDIA_ALREADY_USED` من V1 يُستخدم عند إعادة استعمال مفتاح مرفق.)

### 4.1 Conversations

| Method + Path | Body / Query | Success | Rules & Errors |
| --- | --- | --- | --- |
| `POST /conversations/direct` | `{ userId: UUID }` | `200/201 ConversationDto` (201 إذا أُنشئت) | الهدف ACTIVE وليس أنا، وبلا حظر في أي اتجاه. `404 USER_NOT_FOUND`, `403 BLOCKED`, `400 VALIDATION_ERROR` |
| `POST /conversations/groups` | `{ title: string(1..100), memberIds: UUID[] (1..255), avatarKey?: string }` | `201 ConversationDto` | المنشئ `OWNER`. كل الأعضاء ACTIVE. حظر بين المنشئ وأي عضو ⇒ `403 CANNOT_ADD_MEMBER`. `400 INVALID_GROUP` |
| `GET /conversations` | `cursor?, limit? (1..50, default 20)` | `Page<ConversationDto>` | الترتيب `lastMessageAt DESC, id DESC` (المحادثات الفارغة تظهر آخرًا بترتيب `createdAt`) |
| `GET /conversations/:id` | — | `ConversationDto` (مع `members`) | `404 CONVERSATION_NOT_FOUND` |
| `PATCH /conversations/:id` | `{ title?, avatarKey? }` | `ConversationDto` | GROUP فقط، `OWNER`/`ADMIN`. `403 NOT_CONVERSATION_ADMIN`. يُنشئ رسالة SYSTEM `TITLE_CHANGED` |
| `POST /conversations/:id/members` | `{ userIds: UUID[] (1..50) }` | `200 ConversationDto` | `OWNER`/`ADMIN`. الموجود أصلًا يُتجاهل. الحد `GROUP_MAX_MEMBERS` ⇒ `400 INVALID_GROUP`. حظر أو غير ACTIVE ⇒ `403 CANNOT_ADD_MEMBER` |
| `DELETE /conversations/:id/members/:userId` | — | `204` | الإزالة: `OWNER`/`ADMIN` (الـADMIN لا يزيل `OWNER` ولا `ADMIN` آخر). المغادرة: `:userId = me`. انظر 5.4 |
| `PATCH /conversations/:id/members/:userId` | `{ role: 'ADMIN' \| 'MEMBER' }` | `200 ConversationDto` | `OWNER` فقط. `403 NOT_CONVERSATION_OWNER` |
| `PATCH /conversations/:id/me` | `{ mutedUntil: ISO \| null }` | `200` | الكتم يمنع الـpush فقط (لا الرسائل) |
| `POST /conversations/:id/read` | `{ upToSeq: int ≥ 0 }` | `204` | معادل لـWS `message.read` |

### 4.2 Messages

| Method + Path | Body / Query | Success | Rules & Errors |
| --- | --- | --- | --- |
| `GET /conversations/:id/messages` | `before?: seq`, `after?: seq`, `limit? (1..100, default 50)` | `{ items: MessageDto[], hasMore: boolean }` | `before` ⇒ ترتيب تنازلي (التاريخ)، `after` ⇒ تصاعدي (المزامنة). لا يجتمعان (`400 VALIDATION_ERROR`). لا شيء ⇒ آخر `limit`. يُرجع فقط `seq > joinedSeq` |
| `POST /conversations/:id/messages` | `SendMessageDto` | `201 MessageDto` | مسار بديل للـWS بنفس الخدمة (5.1). إعادة نفس `clientMsgId` ⇒ `200` بنفس الرسالة |
| `PATCH /messages/:id` | `{ text: string }` | `200 MessageDto` | المرسل فقط، نوع `TEXT`، غير محذوفة، خلال `EDIT_WINDOW_MINUTES`. `403 NOT_MESSAGE_OWNER`, `409 MESSAGE_NOT_EDITABLE` |
| `DELETE /messages/:id` | — | `204` | المرسل، أو `OWNER`/`ADMIN` في GROUP (لرسائل الآخرين غير SYSTEM). soft delete (5.2). حذف رسالة محذوفة ⇒ `404 MESSAGE_NOT_FOUND` |
| `POST /messages/:id/report` | `{ reason: ReportReason }` | `201 { id, messageId, reason, createdAt }` | عضو في المحادثة، ليس صاحب الرسالة. `409 ALREADY_REPORTED`. لا عدّاد تلقائي ولا قفل (5.7) |

```ts
export class SendMessageDto {
  @IsUUID() clientMsgId!: string;
  @IsEnum(MessageType) @IsIn(['TEXT','IMAGE','VIDEO','FILE','VOICE']) type!: MessageType;
  @IsOptional() @Transform(sanitize) @IsString() @MaxLength(CHAT_TEXT_MAX) text?: string;      // للمرفقات: ≤ CHAT_CAPTION_MAX
  @IsOptional() @IsUUID() replyToId?: string;                                                  // نفس المحادثة، غير محذوفة
  @ValidateIf((o) => o.type !== 'TEXT') @IsString() @Matches(CHAT_KEY_REGEX) attachmentKey?: string;
  @ValidateIf((o) => o.type === 'VIDEO' || o.type === 'VOICE')
  @IsInt() @Min(1) durationSeconds?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(64) @IsInt({ each: true }) @Min(0, { each: true }) @Max(255, { each: true }) waveform?: number[];
  @IsOptional() @Transform(sanitizeFileName) @IsString() @MaxLength(120) fileName?: string;     // لـFILE
}
```
`CHAT_KEY_REGEX = /^chat\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov|m4a|ogg|webm|pdf|docx|xlsx|pptx|doc|xls|ppt|txt|csv|zip)$/`

**SendMessageDto errors:** `400 EMPTY_MESSAGE` (TEXT بدون نص بعد الـsanitize)، `400 ATTACHMENT_NOT_UPLOADED`، `400 INVALID_ATTACHMENT`، `403 ATTACHMENT_NOT_OWNED`، `403 BLOCKED`، `404 CONVERSATION_NOT_FOUND`، `404 MESSAGE_NOT_FOUND` (replyTo)، `409 MEDIA_ALREADY_USED`، `502 STORAGE_ERROR`.

### 4.3 Attachments (Chat Media)

**`POST /chat-media/presign`** (Throttle: 30/min)

```ts
export class ChatPresignDto {
  @IsUUID() conversationId!: string;
  @IsIn(['IMAGE','VIDEO','FILE','VOICE']) kind!: MessageType;
  @IsString() contentType!: string;
  @Type(() => Number) @IsInt() @Min(1) sizeBytes!: number;
  @ValidateIf((o) => o.kind === 'VIDEO' || o.kind === 'VOICE') @IsInt() @Min(1) durationSeconds?: number;
}
```

| kind | Allowed contentType → ext | Max size | Max duration |
| --- | --- | --- | --- |
| IMAGE | `image/jpeg`→jpg, `image/png`→png, `image/webp`→webp | 5 MB | — |
| VIDEO | `video/mp4`→mp4, `video/quicktime`→mov | 50 MB | 60 s |
| VOICE | `audio/mp4`→m4a, `audio/ogg`→ogg, `audio/webm`→webm | 10 MB | 300 s |
| FILE | `application/pdf`→pdf, `…wordprocessingml.document`→docx, `…spreadsheetml.sheet`→xlsx, `…presentationml.presentation`→pptx, `application/msword`→doc, `application/vnd.ms-excel`→xls, `application/vnd.ms-powerpoint`→ppt, `text/plain`→txt, `text/csv`→csv, `application/zip`→zip | 100 MB | — |

أي نوع آخر (بما فيه SVG وHTML والـexecutables والـscripts) ⇒ `400 VALIDATION_ERROR`.

**200 Response:** `{ uploadUrl, key, method: "PUT", headers: { "Content-Type": "..." }, expiresAt }` حيث `key = chat/{conversationId}/{userId}/{uuid}.{ext}`، وصلاحية الرابط 300 ثانية، و`content-type` و`content-length` موقّعان. **Errors:** `400 VALIDATION_ERROR`, `404 CONVERSATION_NOT_FOUND`, `403 BLOCKED` (DIRECT).

**`POST /attachments/urls`** (batch، لتقليل الـround trips)

```json
// Request
{ "ids": ["a1…", "a2…"] }            // 1..50 UUID
// 200 Response
{ "items": [ { "id": "a1…", "url": "https://…signed…", "expiresAt": "2026-10-28T10:05:00.000Z" } ],
  "errors": [ { "id": "a2…", "code": "ATTACHMENT_PENDING" } ] }
```
لكل id: عضوية المحادثة ⇒ وإلا يظهر في `errors` بـ`ATTACHMENT_NOT_FOUND` (لا فرق بين غير موجود وغير مسموح). `PENDING` ⇒ `ATTACHMENT_PENDING`. `REJECTED`/`DELETED` ⇒ `ATTACHMENT_NOT_FOUND`. الرابط presigned GET صلاحيته `PRESIGN_GET_EXPIRES_SECONDS` مع `ResponseContentDisposition` (= `attachment; filename="…"` للـFILE، و`inline` لغيره) و`ResponseCacheControl: private, max-age=300`. أخطاء الـrequest نفسه: `400 VALIDATION_ERROR`.

### 4.4 Blocks & Devices

| Method + Path | Body | Success | Rules |
| --- | --- | --- | --- |
| `POST /blocks/:userId` | — | `204` (idempotent) | لا يحظر نفسه (`400 VALIDATION_ERROR`)، `404 USER_NOT_FOUND` |
| `DELETE /blocks/:userId` | — | `204` | idempotent |
| `GET /blocks` | `cursor?, limit?` | `Page<UserBriefDto>` | |
| `POST /devices` | `{ provider: 'FCM'\|'APNS_VOIP', platform: 'IOS'\|'ANDROID'\|'WEB', token: string(≤512) }` | `204` | upsert على `token`؛ إذا كان لمستخدم آخر يُنقل للطالب |
| `DELETE /devices` | `{ token }` | `204` | يُستدعى عند logout |

**أثر الحظر (V2):** يمنع DIRECT الجديدة، والإرسال داخل DIRECT القائمة، والمكالمات DIRECT، والإضافة لمجموعة (`CANNOT_ADD_MEMBER`) — في الاتجاهين. لا يؤثر على رسائل الطرفين داخل مجموعة مشتركة، والسجل القديم يبقى مقروءًا.

### 4.5 Calls (Phase D)

| Method + Path | Body | Success | Rules & Errors |
| --- | --- | --- | --- |
| `POST /conversations/:id/calls` | — | `201 CallSessionDto` | 5.5-أ. `403 CALL_NOT_ALLOWED`, `403 BLOCKED`, `409 CALL_IN_PROGRESS`, `409 ALREADY_IN_CALL` |
| `POST /calls/:id/join` | — | `200 CallSessionDto` | 5.5-ب. `404 CALL_NOT_FOUND`, `409 CALL_NOT_ACTIVE`, `409 CALL_FULL`, `409 ALREADY_IN_CALL` |
| `POST /calls/:id/decline` | — | `204` | 5.5-ج |
| `POST /calls/:id/end` | — | `204` | مغادرة/إلغاء (5.5-د) |
| `GET /calls/:id` | — | `CallDto` | للمشاركين المدعوّين فقط |
| `POST /webhooks/livekit` | LiveKit event | `200` | `@Public()` + تحقق التوقيع (`WebhookReceiver`) على الـraw body. توقيع غير صالح ⇒ `401 INVALID_TOKEN` |

```ts
interface CallSessionDto {
  call: { id: string; conversationId: string; status: string; initiatorId: string; maxParticipants: number;
          participants: Array<{ userId: string; joinedAt: string | null; leftAt: string | null; declinedAt: string | null }> };
  livekit: { url: string; token: string; expiresInSeconds: number };   // token بصلاحية 120s، يُستخدم للاتصال فقط
  e2ee: { required: true };                                            // العميل يجب ألا يتصل بدون تفعيل E2EE
}
```

### 4.6 WebSocket Contract (namespace `/chat`)

كل event من العميل له `ack` callback يُرجع `{ ok: true, data }` أو `{ ok: false, error: { statusCode, code, message } }` بنفس كتالوج الأخطاء.

**Client → Server**

| Event | Payload | Ack data | Notes |
| --- | --- | --- | --- |
| `message.send` | `SendMessageDto + conversationId` | `MessageDto` | نفس `MessagesService.send` (5.1) |
| `message.read` | `{ conversationId, upToSeq }` | `{}` | |
| `typing.start` / `typing.stop` | `{ conversationId }` | `{}` | 1 كل ثانيتين كحد أقصى؛ بدون تخزين |
| `sync.request` | `{ cursors: [{ conversationId, afterSeq }] }` (≤ 50) | `{ results: [{ conversationId, items: MessageDto[], hasMore }] }` | ≤ 100 رسالة لكل محادثة؛ يكرر العميل حتى `hasMore=false` |
| `auth.refresh` | `{ token }` | `{}` | بعد `auth.expired` |
| `call.key` | `{ callId, toUserId, kind: 'REQUEST'\|'GRANT', publicKey?: string, wrappedKey?: string, keyIndex: int }` (≤ 512 byte) | `{}` | 5.5-هـ: السيرفر يمرر فقط |

**Server → Client:** `message.new` (`MessageDto`) • `message.updated` (`MessageDto`: تعديل/حذف/حالة مرفق) • `message.read` (`{ conversationId, userId, upToSeq }` — فقط لمحادثات ≤ `READ_RECEIPT_MAX_MEMBERS`) • `typing` (`{ conversationId, userId }` ينتهي تلقائيًا عند العميل بعد 5 ثوانٍ) • `conversation.updated` (`ConversationDto`) • `conversation.removed` (`{ conversationId }`) • `call.incoming` (`CallDto + initiator`) • `call.updated` (`CallDto`) • `call.key` (نسخة من الـpayload + `fromUserId`) • `auth.expired`.

---

## 5. Algorithmic Business Logic & Edge Cases

### 5.1 Send Message (الخوارزمية المركزية — WS و REST)

```ts
async send(userId: string, conversationId: string, dto: SendMessageDto) {
  rateLimit('message.send', userId);                                   // 6.1
  const attach = dto.type !== 'TEXT' ? await this.chatMedia.verify(userId, conversationId, dto) : null; // 5.2 (قبل الـtx)

  const { message, created, memberIds } = await prisma.$transaction(async (tx) => {
    // 1) عضوية
    const me = await tx.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } },
                                                        include: { conversation: { select: { type: true } } } });
    if (!me) throw new AppException(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');

    // 2) Idempotency: نفس clientMsgId ⇒ أعد الموجودة بدون بث
    const dup = await tx.message.findUnique({ where: { conversationId_senderId_clientMsgId: { conversationId, senderId: userId, clientMsgId: dto.clientMsgId } } });
    if (dup) return { message: dup, created: false, memberIds: [] };

    // 3) DIRECT: فحص الحظر في الاتجاهين
    if (me.conversation.type === 'DIRECT') {
      const other = await tx.conversationMember.findFirstOrThrow({ where: { conversationId, userId: { not: userId } }, select: { userId: true } });
      const blocked = await tx.userBlock.findFirst({ where: { OR: [
        { blockerId: userId, blockedId: other.userId }, { blockerId: other.userId, blockedId: userId } ] } });
      if (blocked) throw new AppException(403, 'BLOCKED', 'Action not allowed between these users');
    }

    // 4) replyTo (نفس المحادثة، غير محذوفة، seq > joinedSeq للمرسل)
    if (dto.replyToId) { /* findFirst ... else 404 MESSAGE_NOT_FOUND */ }

    // 5) seq ذري (قفل صف المحادثة يسلسل الإرسال داخل المحادثة الواحدة)
    const conv = await tx.conversation.update({ where: { id: conversationId },
      data: { lastSeq: { increment: 1 }, lastMessageAt: new Date() }, select: { lastSeq: true } });

    // 6) الإدخال (الـunique على clientMsgId هو خط الدفاع عند التزامن)
    const msg = await tx.message.create({ data: {
      conversationId, seq: conv.lastSeq, senderId: userId, clientMsgId: dto.clientMsgId, type: dto.type,
      text: dto.text ?? null, replyToId: dto.replyToId ?? null,
      attachment: attach ? { create: { uploaderId: userId, key: attach.key, kind: dto.type, contentType: attach.contentType,
        sizeBytes: attach.sizeBytes, durationSeconds: dto.durationSeconds ?? null, waveform: dto.waveform ?? undefined,
        fileName: dto.fileName ?? null, status: 'PENDING' } } : undefined },
      include: messageInclude });

    // 7) المرسل "قرأ" رسالته
    await tx.conversationMember.update({ where: { conversationId_userId: { conversationId, userId } }, data: { lastReadSeq: conv.lastSeq } });
    return { message: msg, created: true, memberIds: await memberIdsOf(tx, conversationId) };
  }).catch((e) => { if (isPrismaError(e, 'P2002')) return this.loadDuplicate(...) /* race على clientMsgId أو attachment.key ⇒ 409 MEDIA_ALREADY_USED للمفتاح */; throw e; });

  if (created) {                                                       // 8) بعد الـCOMMIT فقط
    this.gateway.emitToConversation(conversationId, 'message.new', toMessageDto(message));
    await this.queues.push.add('message', { conversationId, messageId: message.id });     // الـworker يختار غير المتصلين وغير المكتومين
    if (attach) await this.queues.scan.add('scan', { attachmentId: message.attachment!.id }, { attempts: 5, backoff: { type: 'exponential', delay: 5000 } });
  }
  return toMessageDto(message);
}
```
**ملاحظات:** (1) البث فشله لا يلغي الرسالة؛ العميل يستعيدها بـ`sync.request`. (2) المرفقات تُنشأ كـ`PENDING` وتظهر الرسالة فورًا بحالة "جارٍ المعالجة". (3) الإرسال لمحادثة DIRECT مع طرف `SUSPENDED` مسموح (لا يكشف حالته).

### 5.2 Attachment Pipeline (Upload ⇒ Verify ⇒ Scan ⇒ Serve)

**Verify (داخل `chatMedia.verify`، قبل الـtransaction):**
1. `key` يطابق `chat/{conversationId}/{userId}/…` بالضبط (نفس المحادثة ونفس المرسل) وإلا `403 ATTACHMENT_NOT_OWNED`.
2. `HeadObject`: غير موجود ⇒ `400 ATTACHMENT_NOT_UPLOADED`، وخطأ آخر ⇒ `502 STORAGE_ERROR`.
3. `ContentType` ضمن whitelist الـkind (4.3)، والامتداد يطابقه، `0 < ContentLength ≤ max`، وإلا `400 INVALID_ATTACHMENT`.
4. المفتاح غير مستخدم (`MEDIA_ALREADY_USED` عبر الـunique).

**Scan Worker (`scan` queue):**
```ts
async process({ attachmentId }) {
  const a = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!a || a.status !== 'PENDING') return;
  const stream = (await s3.send(new GetObjectCommand({ Bucket, Key: a.key }))).Body as Readable;
  const verdict = await clamd.scanStream(stream);               // 'OK' | 'FOUND' (INSTREAM، بدون تحميل كامل للذاكرة)
  if (verdict === 'OK') {
    await prisma.attachment.update({ where: { id: a.id }, data: { status: 'READY', scannedAt: new Date() } });
  } else {                                                      // FOUND
    await prisma.$transaction([
      prisma.attachment.update({ where: { id: a.id }, data: { status: 'REJECTED', scannedAt: new Date() } }),
      prisma.message.update({ where: { id: a.messageId }, data: { deletedAt: new Date(), text: null } }),
    ]);
    await s3.send(new DeleteObjectCommand({ Bucket, Key: a.key }));
  }
  gateway.emitToConversation(conversationId, 'message.updated', await loadMessageDto(a.messageId));
}
```
- **Fail-closed:** إذا `clamd` غير متاح يُعاد المحاولة (5 مرات تصاعديًا) والمرفق يبقى `PENDING` ولا يُقدَّم رابطه أبدًا. تنبيه تشغيل إذا `PENDING` أقدم من 10 دقائق.
- **الحذف:** `DELETE /messages/:id` يضبط `deletedAt`، `text=null`، `attachment.status='DELETED'`، ثم job في `cleanup` يحذف الكائن من R2 **ما لم** توجد `MessageReport` على الرسالة (الدليل يُحفظ، انظر 5.7).
- **EXIF/GPS:** العميل ملزم بإزالة بيانات الموقع من الصور قبل الرفع (بند في مواصفات العميل). السيرفر لا يعيد ترميز الصور في V2.
- **التقديم الآمن:** الـbucket خاص، الروابط presigned، و`X-Content-Type-Options: nosniff`، والملفات من نوع FILE تُقدَّم `attachment` دائمًا.

### 5.3 Pagination
- **قائمة المحادثات:** query أول على `conversationMember` للمستخدم join `conversation`، ترتيب `(lastMessageAt DESC NULLS LAST, id DESC)`، والـcursor مركّب `{t, i}` كما في V1، `take = limit + 1`. استعلام ثانٍ واحد لـ`lastMessage` بأزواج `(conversationId, seq = lastSeq)` (بدون N+1)، واستعلام ثالث للطرف الآخر في الـDIRECT. المحادثة المحذوفة آخر رسالة فيها تعرض `lastMessage` بنص `null`.
- **سجل الرسائل:** keyset على `seq`: `before=S` ⇒ `where seq < S AND seq > joinedSeq ORDER BY seq DESC`، `after=S` ⇒ `where seq > max(S, joinedSeq) ORDER BY seq ASC`، و`take = limit + 1` لحساب `hasMore`. بلا offset أبدًا.

### 5.4 Group Membership Operations

| Operation | Algorithm |
| --- | --- |
| إضافة أعضاء | في tx: التحقق من الدور والحد والحظر/ACTIVE، ثم `createMany(skipDuplicates)` بـ`joinedSeq = lastSeq`, `lastReadSeq = lastSeq`، ثم رسالة SYSTEM `MEMBER_ADDED {userIds}` (تأخذ seq جديد). بعد الـCOMMIT: `io.in('user:{id}').socketsJoin('conv:{cid}')` لكل مضاف + `conversation.updated`. |
| إزالة / مغادرة | في tx: حذف صف العضوية، ورسالة SYSTEM (`MEMBER_REMOVED` أو `MEMBER_LEFT`). بعد الـCOMMIT: `socketsLeave('conv:{cid}')` + `conversation.removed` للمُزال. إذا كانت المكالمة النشطة تحتوي المُزال ⇒ يُطرد من الغرفة (`removeParticipant`) ويُسجَّل `leftAt`. |
| مغادرة الـOWNER | نقل الملكية تلقائيًا لأقدم `ADMIN` (بـ`joinedAt`) وإلا لأقدم `MEMBER`، ثم المغادرة، ورسالة SYSTEM `ROLE_CHANGED`. إذا لم يبقَ أعضاء تبقى المحادثة بلا أعضاء وتُنظَّف يدويًا (§7). |
| عضو جديد | يرى الرسائل من `seq > joinedSeq` فقط، ولا يرى السجل السابق. العودة بعد الإزالة تنشئ `joinedSeq` جديدًا. |
| DIRECT | لا إضافة ولا إزالة ولا مغادرة (`400 VALIDATION_ERROR`). |

### 5.5 Call Lifecycle (State Machine)

```
RINGING ──(أول مدعو ينضم)──► ACTIVE ──(آخر مشارك يغادر / 1:1 أحدهما يغادر)──► ENDED
   │                                                     
   ├─(المبادر يلغي)──────────► CANCELED
   ├─(الكل رفض)───────────────► DECLINED
   └─(45 ثانية بلا انضمام)────► MISSED
```

**أ) البدء `POST /conversations/:id/calls`** — داخل tx:
1. عضوية. GROUP بعدد أعضاء > `CALL_GROUP_MAX_MEMBERS` ⇒ `403 CALL_NOT_ALLOWED`. DIRECT + حظر ⇒ `403 BLOCKED`.
2. لا call بحالة `RINGING|ACTIVE` على المحادثة (`409 CALL_IN_PROGRESS`) ولا المبادر مشارك نشط (`joinedAt != null AND leftAt = null`) في call أخرى (`409 ALREADY_IN_CALL`).
3. إنشاء `Call(RINGING, livekitRoom='call_'+id)` و`CallParticipant` لكل عضو (المبادر `joinedAt=now`).
4. `RoomServiceClient.createRoom({ name, emptyTimeout: 30, maxParticipants: CALL_MAX_PARTICIPANTS })`. فشل ⇒ rollback و`502`.
5. توليد token المبادر (5.5-و).
بعد الـCOMMIT: `call.incoming` لـ`user:{id}` لكل مدعو + push عالي الأولوية (iOS: APNs VoIP، Android: FCM `priority: high` data-only) لكل المدعوين (الكتم لا يمنع إشعار المكالمة) + job `call-timeout` متأخر 45 ثانية.

**ب) الانضمام `POST /calls/:id/join`:** يتحقق: مدعو، `status ∈ {RINGING, ACTIVE}`، لم يرفض، عدد `joinedAt != null AND leftAt = null` < `CALL_MAX_PARTICIPANTS` (`409 CALL_FULL`)، ليس في call أخرى. يضبط `joinedAt`. إذا كان أول منضم غير المبادر: `status=ACTIVE`, `answeredAt=now`. يرجع token. بث `call.updated`.

**ج) الرفض:** `declinedAt=now`. DIRECT ⇒ `DECLINED` فورًا. GROUP ⇒ `DECLINED` فقط إذا رفض كل المدعوين ولم ينضم أحد.

**د) المغادرة/الإنهاء:** `leftAt=now`. المبادر والحالة `RINGING` ⇒ `CANCELED`. وبعدها إذا (DIRECT) أو (عدد النشطين = 0) ⇒ `ENDED` + `endedAt` + `deleteRoom`. في كل نهاية (ENDED/MISSED/DECLINED/CANCELED) تُنشأ رسالة SYSTEM `CALL_ENDED { callId, status, durationSeconds }` ويُرسَل push "مكالمة فائتة" للمدعوين الذين لم يرد عليهم في حالة `MISSED`/`CANCELED`.

**هـ) توزيع مفاتيح E2EE (السيرفر مُمرِّر أعمى):**
1. المبادر يولّد `callKey` عشوائيًا (32 byte) على جهازه ولا يرسله أبدًا خامًا.
2. كل منضم يولّد زوج X25519 مؤقتًا ويرسل `call.key { kind:'REQUEST', toUserId: distributor, publicKey }`.
3. الموزِّع يحسب `ECDH` ثم يشفّر `callKey` (AES-GCM بمفتاح مشتق HKDF) ويرسل `call.key { kind:'GRANT', toUserId, publicKey: ephemeralPub, wrappedKey, keyIndex }`.
4. **الموزِّع** = أقدم مشارك نشط بـ`joinedAt`. عند مغادرة أي مشارك يولّد الموزِّع `callKey` جديدًا ويوزعه على الباقين (`keyIndex + 1`) بنفس الآلية (rotation).
5. السيرفر يتحقق فقط أن المرسل والمستقبل مشاركان نشطان في نفس الـcall وأن الحجم ≤ 512 byte، ويمرر بلا قراءة.
6. **رمز التحقق:** يعرض العميلان `SHA-256(callKey)` مختصرًا (4 أرقام) ليقارنه المتحدثان شفهيًا. بدونه لا حماية من سيرفر إشارة خبيث (قبول مخاطرة موثّق، نفس نموذج Signal قبل التحقق).
7. **حد صريح:** السيرفر لا يستطيع فرض تفعيل E2EE على العميل؛ `e2ee.required` تعليمة للعميل، ويجب أن تغطيها اختبارات العميل.

**و) توكن LiveKit:**
```ts
const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity: userId, name: displayName, ttl: LIVEKIT_TOKEN_TTL_SECONDS });
at.addGrant({ roomJoin: true, room: call.livekitRoom, canSubscribe: true, canPublish: true,
              canPublishSources: [TrackSource.MICROPHONE], canPublishData: false });   // لا roomAdmin ولا roomCreate
```
الـtoken يُستخدم للاتصال فقط؛ إعادة الاتصال بعد 120 ثانية تتطلب `POST /calls/:id/join` جديدًا (idempotent للمنضم الحالي).

**ز) Webhook:** `participant_left` ⇒ `leftAt` إن لم يُضبط ثم تطبيق منطق (د). `room_finished` ⇒ ضمان `ENDED`. أحداث لغرف غير معروفة تُتجاهل. المعالجة idempotent.

**ح) Job الـtimeout:** إذا ما زال `RINGING` ⇒ `MISSED`، ويطبق (د) بلا مغادرة.

**ط) المقفول أثناء مكالمة:** استقبال `user.suspended` ⇒ لكل call نشط له: `removeParticipant` + `leftAt` + منطق (د).

### 5.6 Typing & Read Receipts
- `typing.*`: يُبث لـ`conv:{id}` بدون تخزين، مع استبعاد المرسل (`socket.to(room)`).
- `message.read`: `lastReadSeq = GREATEST(lastReadSeq, LEAST(upToSeq, conversation.lastSeq))` بتحديث شرطي واحد (لا تراجع). يُبث `message.read` فقط إذا عدد الأعضاء ≤ `READ_RECEIPT_MAX_MEMBERS`.

### 5.7 Chat Moderation (Reports)
- البلاغ على رسالة يحفظ `snapshotText` و`snapshotAttachmentKey` وقت البلاغ (حتى لو حُذفت الرسالة لاحقًا) ويمنع حذف كائن R2 المرتبط.
- **لا إخفاء ولا قفل تلقائي** من بلاغات الشات (منع الـbrigading على محادثات خاصة)؛ المراجعة يدوية عبر الـRunbook (§7) والقفل قرار بشري.
- قيود: `UNIQUE(messageId, reporterId)`، لا بلاغ على رسالتك، العضو فقط، ولا بلاغ على رسائل SYSTEM.

---

## 6. Non-Functional, Security & Operational Rules

### 6.1 Rate Limiting

HTTP: نفس آلية V1 (Redis storage الآن). WebSocket: token bucket لكل مستخدم في Redis (`rl:{event}:{userId}`) يعمل قبل أي منطق، والتجاوز ⇒ ack خطأ `429 TOO_MANY_REQUESTS` (والتكرار المفرط 5 مرات متتالية في دقيقة ⇒ قطع الاتصال).

| Scope | Limit |
| --- | --- |
| `message.send` (WS/REST) | 20 / 10s و120 / دقيقة لكل مستخدم |
| `typing.*` | 1 / 2s لكل محادثة |
| `POST /chat-media/presign` | 30 / دقيقة |
| `POST /attachments/urls` | 60 / دقيقة |
| `POST /conversations/groups` | 10 / ساعة |
| `POST /conversations/:id/members` | 30 / ساعة |
| `POST /conversations/direct` | 30 / ساعة |
| إنشاء مكالمة | 5 / دقيقة و30 / ساعة |
| `call.key` | 60 / دقيقة لكل call |
| `POST /messages/:id/report` | 5 / دقيقة (نفس V1) |
| WS handshakes من نفس IP | 20 / دقيقة |

### 6.2 Security Controls

| Area | Rule |
| --- | --- |
| Authorization | فحص العضوية في **كل** REST و WS event (لا ثقة في الـrooms وحدها). الأدوار تُفحص من الـDB وليس من الـclient. |
| Transport | WSS/HTTPS فقط، `Origin` whitelist للـhandshake (`CORS_ORIGINS`)، `transports: ['websocket']`، وحد `maxHttpBufferSize = 64KB`. |
| Storage | Bucket `chat/*` خاص بالكامل، وتشفير at-rest مفعّل، والـpresigned GET قصير العمر، وCORS على الـbucket لدومين التطبيق فقط. |
| Files | whitelist صارم، حجم ونوع موقّعان في الـPUT، فحص ClamAV إلزامي (fail-closed)، `nosniff`، `Content-Disposition: attachment` للملفات، واسم الملف يُعقَّم (`sanitizeFileName`: حذف المسارات والـcontrol chars، ≤ 120). |
| Push | بدون محتوى الرسالة: `data: { type, conversationId, messageId }` فقط، والعميل يجلب المحتوى بعد الاستلام. إزالة الـtoken عند أخطاء `UNREGISTERED`/`BadDeviceToken`. |
| Logging | Pino redact إضافي: `text`, `systemPayload`, `uploadUrl`, `livekit.token`, `wrappedKey`, `publicKey`. يُمنع تسجيل أي payload رسالة. تُسجَّل المعرّفات والأحجام والـlatency فقط. |
| Calls | token 120s وصوت فقط وبلا admin، E2EE مطلوب، تدوير المفتاح عند مغادرة مشارك، وطرد فوري عند الإزالة/القفل. |
| Abuse | حظر المستخدمين، حدود الإنشاء، فحص `BLOCKED`، حد 256 عضو، وبلاغات يدوية. |
| Sanitization | `sanitizeText` من V1 على كل نص، وSQL عبر Prisma فقط. |
| Supply chain | `npm audit` في الـCI، وتثبيت الإصدارات، ومراجعة تحديثات `socket.io`/`livekit-server-sdk` دوريًا. |
| Edge | Cloudflare WAF قدام الـAPI، وحماية DDoS، و`trust proxy` مضبوط. |
| Pentest | اختبار اختراق قبل الإطلاق: authz لكل event، IDOR على المرفقات والمحادثات، تجاوز rate limit، وقراءة الـtokens من اللوج. |

### 6.3 Threat → Mitigation (مختصر)

| Threat | Mitigation |
| --- | --- |
| قراءة محادثة ليست لي (IDOR) | `404` موحد + فحص عضوية في الـDB لكل عملية |
| ملف خبيث | whitelist + ClamAV fail-closed + `attachment` disposition |
| تسريب رابط ملف | presigned قصير (5 دقائق) + لا تخزين للروابط + كل رابط يمر على فحص العضوية |
| إعادة تشغيل الرسالة (replay/duplicate) | `clientMsgId` + unique constraint |
| إغراق (spam/flood) | rate limits + قطع الاتصال المتكرر |
| مستخدم مقفول يواصل الاتصال | pub/sub فوري + كاش حالة 30s + رفض الـhandshake |
| تنصت على المكالمات (SFU/شبكة) | DTLS-SRTP + E2EE للـframes + رمز تحقق |
| سيرفر إشارة خبيث | رمز التحقق الشفهي (قبول مخاطرة موثّق) |
| سرقة جلسة WS | token قصير + إعادة تحقق + `checkRevoked` |

### 6.4 Performance Targets (تُقاس بـk6/Artillery قبل الإطلاق)

| Metric | Target |
| --- | --- |
| `message.send` ack | p95 < 100ms، p99 < 250ms |
| بث الرسالة لباقي أعضاء الغرفة (داخل instance) | p95 < 50ms بعد الـCOMMIT |
| اتصالات WS متزامنة لكل instance | 5,000 (القيمة تُثبَّت بعد الاختبار) |
| إرسال متواصل | 200 رسالة/ثانية للـcluster بدون ارتفاع الـlatency |
| `GET /conversations/:id/messages` | p95 < 80ms |
| `GET /conversations` | p95 < 120ms |
| `invite → call.incoming` عند المدعو المتصل | p95 < 500ms |
| ضغط زر الرد → سماع الصوت | p95 < 2s |

**أدوات الأداء:** PgBouncer، `@@unique([conversationId, seq])` كـindex للقراءة، استعلامات بلا N+1، payloads صغيرة (بدون عناصر زائدة)، `compression` معطّل للـWS الصغير، sticky sessions غير مطلوبة (WebSocket فقط + Redis adapter)، وحد 1000 غرفة `conv:*` لكل socket عند الاتصال.

### 6.5 Observability
Prometheus metrics: عدد الـsockets، `message_send_duration_seconds`، عمق كل queue، عدد مرفقات `PENDING` الأقدم من 10 دقائق، `calls_active`, `call_setup_duration_seconds`. تنبيهات: `PENDING` متأخر، queue lag > 60s، فشل `clamd`، ارتفاع 5xx.

### 6.6 Data Retention
الرسائل تُحفظ دون حد زمني. المرفقات المحذوفة تُزال من R2 خلال 24 ساعة (ما عدا الرسائل المبلَّغ عنها). سجلات المكالمات (`calls`) تُحفظ، ولا يُسجَّل صوت ولا مفاتيح.

---

## 7. Operations & Manual Runbook (Admin Tasks)

كل الاستعلامات `psql`، وكل تعديل على `production` بعد `pg_dump` وبعد التجربة على `staging`. تذكير V1: أعمدة camelCase بين `"` و`updatedAt` يُضبط يدويًا.

### 7.1 مراجعة بلاغات الرسائل
```sql
SELECT r.id, r."messageId", r.reason, r."createdAt", m."conversationId", m."senderId",
       left(coalesce(r."snapshotText", ''), 200) AS snapshot, r."snapshotAttachmentKey"
FROM message_reports r JOIN messages m ON m.id = r."messageId"
ORDER BY r."createdAt" DESC LIMIT 50;
```
(الأدلة محفوظة في `snapshotText`/`snapshotAttachmentKey` حتى لو حُذفت الرسالة.)

### 7.2 قفل مستخدم يدويًا (تحديث لـV1 §7.3 + V2)
```sql
UPDATE users SET status = 'SUSPENDED', "updatedAt" = now() WHERE id = :'user_id' RETURNING id, status;
```
```bash
redis-cli PUBLISH user.suspended <user_id>     # يقطع الـsockets ويُنهي المكالمات فورًا
```
فك القفل (V1 §7.3) لا يحتاج PUBLISH.

### 7.3 حذف رسالة مخالفة يدويًا
```sql
BEGIN;
UPDATE messages SET "deletedAt" = now(), text = NULL WHERE id = :'message_id' AND "deletedAt" IS NULL RETURNING id, "conversationId";
UPDATE attachments SET status = 'DELETED' WHERE "messageId" = :'message_id' RETURNING key;   -- سجّل المفتاح
COMMIT;
```
الكائن في R2 يُترك إن كان دليلًا لبلاغ، وإلا يحذفه job `cleanup` خلال 24 ساعة (أو يدويًا بالمفتاح المسجَّل). لإشعار العملاء المتصلين: `redis-cli PUBLISH` غير مدعوم لهذا؛ يظهر التغيير عند المزامنة التالية.

### 7.4 إنهاء مكالمة عالقة
```sql
BEGIN;
UPDATE call_participants SET "leftAt" = now() WHERE "callId" = :'call_id' AND "leftAt" IS NULL;
UPDATE calls SET status = 'ENDED', "endedAt" = now() WHERE id = :'call_id' AND status IN ('RINGING','ACTIVE') RETURNING id, "livekitRoom";
COMMIT;
```
ثم احذف الغرفة من LiveKit (`lk room delete <livekitRoom>` أو من الـdashboard).
```sql
-- مكالمات عالقة (أقدم من ساعتين)
SELECT id, status, "createdAt" FROM calls WHERE status IN ('RINGING','ACTIVE') AND "createdAt" < now() - interval '2 hours';
```

### 7.5 مرفقات PENDING المتأخرة
```sql
SELECT id, "messageId", key, "createdAt" FROM attachments WHERE status = 'PENDING' AND "createdAt" < now() - interval '10 minutes' ORDER BY "createdAt";
```
الأسباب المعتادة: `clamd` متوقف أو الـworker متوقف. افحص الخدمتين ثم أعد الجدولة (`scan` queue) من سكربت: `queues.scan.add('scan', { attachmentId })` لكل id. **لا** تغيّر الحالة إلى `READY` يدويًا دون فحص.

### 7.6 محادثات بلا أعضاء (تنظيف)
```sql
SELECT c.id FROM conversations c LEFT JOIN conversation_members m ON m."conversationId" = c.id
GROUP BY c.id HAVING count(m."userId") = 0;
```
الحذف (`DELETE FROM conversations WHERE id = …`) يُمرر بالـCascade على الرسائل والمرفقات والمكالمات. **قبل الحذف** استخرج مفاتيح المرفقات (`SELECT a.key FROM attachments a JOIN messages m ON m.id = a."messageId" WHERE m."conversationId" = …`) واحذفها من R2، واستثنِ أي محادثة فيها `message_reports` (دليل).

### 7.7 تنظيف الملفات اليتيمة (`chat/*`)
نفس سكربت V1 §7.4-ب مع تعديل المصدر المرجعي: المفتاح "مستخدم" إذا ورد في `attachments.key` أو `conversations."avatarKey"` أو `message_reports."snapshotAttachmentKey"`، والبادئة `chat/`، والحد الأدنى للعمر 24 ساعة، و`DRY_RUN=true` افتراضيًا.

### 7.8 صيانة دورية

| Task | Frequency | Action |
| --- | --- | --- |
| Backup | يوميًا | `pg_dump` (كما V1) والاحتفاظ بـ14 نسخة |
| تحديث تعريفات ClamAV | يوميًا | `freshclam` تلقائي + مراقبة الفشل |
| فحص عمق الـqueues | مستمر (تنبيه) | `bullmq` dashboard أو metrics |
| مراجعة بلاغات الشات | حسب قرار المهندس | 7.1 |
| تنظيف الملفات اليتيمة | أسبوعيًا | 7.7 |
| تدوير أسرار LiveKit/APNs/FCM | كل 90 يومًا أو عند الشك | تحديث env + إعادة تشغيل منظمة |
| فحص الـindexes | بعد الإطلاق بأسبوع | `EXPLAIN ANALYZE` على قراءة السجل وقائمة المحادثات |

---

## 8. Phasing & Acceptance Criteria

كل مرحلة تُنشر بشكل مستقل وبـfeature flag، ولا تبدأ التالية قبل اكتمال معايير القبول.

| Phase | Scope | Acceptance (لازم كلها) |
| --- | --- | --- |
| **A** | C-01..C-07: DIRECT/GROUP، نص، reply، تعديل/حذف، قراءة/typing، حظر، بلاغات، WS + Redis adapter | • اختبار تزامن: 50 مرسلًا لمحادثة واحدة ⇒ `seq` بلا فجوات ولا تكرار • إعادة إرسال نفس `clientMsgId` 10 مرات ⇒ رسالة واحدة • عضو جديد لا يرى ما قبل `joinedSeq` • غير العضو يأخذ `404` في كل endpoint • المقفول يُقطع خلال ثانية (pub/sub) و30 ثانية كحد أقصى بدونه • استعادة بعد انقطاع: `sync.request` يعيد كل الفائت بالترتيب • أهداف 6.4 للرسائل محققة |
| **B** | C-08, C-09: مرفقات وفويس نوت وفحص الفيروسات | • ملف EICAR ⇒ `REJECTED` والرسالة تُحذف والكائن يُحذف • إيقاف `clamd` ⇒ المرفق يبقى `PENDING` ولا يُصدر له رابط • رفع بحجم/نوع مخالف يُرفض من R2 نفسه • تحميل مرفق محادثة ليست لي ⇒ لا رابط • الروابط تنتهي بعد 5 دقائق • لا مرفق يُقدَّم inline لنوع FILE |
| **C** | C-10: Push | • لا محتوى في أي payload • المتصل لا يستلم push • المكتوم لا يستلم push • token غير صالح يُحذف تلقائيًا |
| **D** | C-11, C-12: مكالمات وE2EE | • token ينتهي بعد 120s ولا يسمح بالنشر لغير الميكروفون • مدعو ثالث على DIRECT مرفوض • المشارك رقم 9 ⇒ `CALL_FULL` • مهلة 45s ⇒ `MISSED` ورسالة SYSTEM • إزالة عضو أثناء المكالمة ⇒ طرد فوري + rotation للمفتاح • قفل مستخدم أثناء مكالمة ⇒ يُطرد خلال ثانية • webhook بتوقيع خاطئ ⇒ `401` • محاولة اتصال بدون E2EE من العميل تفشل في اختبار العميل • أهداف 6.4 للمكالمات محققة |

**اختبارات إلزامية قبل الإطلاق:** unit للـservices (الأدوار، الحظر، النوافذ الزمنية)، integration على Postgres/Redis حقيقيين (لا mocks للـDB)، e2e للـWS بعميلين على الأقل، اختبار حمل k6 بأهداف 6.4، واختبار اختراق (6.2).

---

## ملحق: ترتيب التنفيذ المقترح (مهندس واحد)
1. بنية تحتية: Redis + PgBouncer + تعديلات V1 (2.6).
2. Schema + migrations (القسم 3).
3. Conversations + Messages + Gateway (A) ثم اختبار التزامن.
4. Chat-media + worker الفحص (B).
5. Devices + push (C).
6. LiveKit + Calls + مفاتيح E2EE (D) — بالتوازي مع تطوير العميل لأنه الأكثر اعتمادًا عليه (CallKit/ConnectionService).
