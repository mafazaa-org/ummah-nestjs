# دليل المطور - الواجهة الخلفية (Backend)
## Social Connect API Server 🖥️

> دليل شامل لمطوري الواجهة الخلفية لمنصة Social Connect المبنية بـ NestJS و MongoDB

---

## 📋 نظرة عامة

منصة Social Connect Backend API هي خدمة RESTful شاملة مبنية بـ NestJS و MongoDB. توفر المنصة نظام مصادقة متقدم، إدارة المستخدمين، المنشورات، المجموعات، الصفحات، والمحادثات الفورية مع دعم الوسائط المتعددة.

---

## 🏗️ البنية التحتية للمشروع

### هيكل الملفات والمجلدات

```
backend/
├── src/
│   ├── main.ts                          # نقطة البداية الرئيسية
│   ├── app.module.ts                    # الوحدة الرئيسية للتطبيق
│   ├── app.controller.ts                # متحكم التطبيق الرئيسي
│   │
│   ├── auth/                            # نظام المصادقة
│   │   ├── auth.controller.ts           # نقاط نهاية المصادقة
│   │   ├── auth.service.ts              # منطق المصادقة
│   │   ├── auth.module.ts               # وحدة المصادقة
│   │   ├── dto/                         # كائنات نقل البيانات
│   │   │   ├── login.dto.ts            # بيانات تسجيل الدخول
│   │   │   ├── update-auth-code.dto.ts # تحديث رمز المصادقة
│   │   │   └── update-profile.dto.ts   # تحديث الملف الشخصي
│   │   ├── guards/                      # حراس الحماية
│   │   │   ├── jwt-auth.guard.ts       # حارس JWT الأساسي
│   │   │   └── jwt-refresh.guard.ts    # حارس تجديد JWT
│   │   └── strategies/                  # استراتيجيات المصادقة
│   │       ├── jwt.strategy.ts         # استراتيجية JWT
│   │       └── jwt-refresh.strategy.ts # استراتيجية تجديد JWT
│   │
│   ├── users/                           # إدارة المستخدمين
│   │   ├── users.controller.ts          # نقاط نهاية المستخدمين
│   │   ├── users.service.ts             # خدمات المستخدمين
│   │   ├── users.module.ts              # وحدة المستخدمين
│   │   ├── schemas/
│   │   │   └── user.schema.ts          # مخطط المستخدم
│   │   └── dto/
│   │       ├── create-user.dto.ts      # إنشاء مستخدم
│   │       └── update-user.dto.ts      # تحديث مستخدم
│   │
│   ├── posts/                           # إدارة المنشورات
│   │   ├── posts.controller.ts          # نقاط نهاية المنشورات
│   │   ├── posts.service.ts             # خدمات المنشورات
│   │   ├── posts.module.ts              # وحدة المنشورات
│   │   ├── schemas/
│   │   │   └── post.schema.ts          # مخطط المنشور
│   │   └── dto/
│   │       ├── create-post.dto.ts      # إنشاء منشور
│   │       ├── update-post.dto.ts      # تحديث منشور
│   │       └── repost.dto.ts           # إعادة النشر
│   │
│   ├── groups/                          # إدارة المجموعات
│   │   ├── groups.controller.ts         # نقاط نهاية المجموعات
│   │   ├── groups.service.ts            # خدمات المجموعات
│   │   ├── groups.module.ts             # وحدة المجموعات
│   │   ├── schemas/
│   │   │   └── group.schema.ts         # مخطط المجموعة
│   │   └── dto/                         # DTOs المجموعات
│   │       ├── create-group.dto.ts
│   │       ├── update-group.dto.ts
│   │       ├── manage-member.dto.ts
│   │       └── update-group-settings.dto.ts
│   │
│   ├── pages/                           # إدارة الصفحات
│   │   ├── pages.controller.ts
│   │   ├── pages.service.ts
│   │   ├── pages.module.ts
│   │   ├── schemas/page.schema.ts
│   │   └── dto/
│   │
│   ├── comments/                        # نظام التعليقات
│   │   ├── comments.controller.ts
│   │   ├── comments.service.ts
│   │   ├── comments.module.ts
│   │   ├── schemas/comment.schema.ts
│   │   └── dto/
│   │
│   ├── messages/                        # نظام الرسائل
│   │   ├── messages.controller.ts
│   │   ├── messages.service.ts
│   │   ├── messages.module.ts
│   │   ├── messages.gateway.ts         # WebSocket Gateway
│   │   ├── schemas/
│   │   │   ├── message.schema.ts
│   │   │   └── conversation.schema.ts
│   │   └── dto/
│   │
│   ├── friend-requests/                 # طلبات الصداقة
│   │   ├── friend-requests.controller.ts
│   │   ├── friend-requests.service.ts
│   │   ├── friend-requests.module.ts
│   │   ├── schemas/friend-request.schema.ts
│   │   └── dto/
│   │
│   ├── stories/                         # القصص المؤقتة
│   │   ├── stories.controller.ts
│   │   ├── stories.service.ts
│   │   ├── stories.module.ts
│   │   ├── schemas/story.schema.ts
│   │   └── dto/
│   │
│   ├── common/                          # المكونات المشتركة
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts # مرشح الأخطاء
│   │   └── interceptors/
│   │       └── transform.interceptor.ts # محول الاستجابات
│   │
│   └── utils/                           # الأدوات المساعدة
│       └── code-generator.util.ts       # مولد رموز المصادقة
│
├── scripts/                             # سكريبتات الصيانة
│   ├── delete-invalid-conversations.ts
│   ├── fix-friends-data.ts
│   └── migrate-group-admins.ts
│
├── uploads/                             # الملفات المرفوعة
├── package.json                        # إعدادات المشروع
├── tsconfig.json                       # إعدادات TypeScript
└── .env.example                       # مثال متغيرات البيئة
```

---

## 📦 المكتبات والتبعيات

### مكتبات أساسية NestJS

| المكتبة | الإصدار | الاستخدام |
|---------|----------|-----------|
| **@nestjs/core** | `^10.3.0` | النواة الأساسية |
| **@nestjs/common** | `^10.3.0` | المكونات المشتركة |
| **@nestjs/platform-express** | `^10.3.0` | منصة Express |

### قاعدة البيانات والمصادقة

| المكتبة | الإصدار | الاستخدام |
|---------|----------|-----------|
| **@nestjs/mongoose** | `^10.0.2` | ODM لـ MongoDB |
| **mongoose** | `^8.0.3` | MongoDB driver |
| **@nestjs/jwt** | `^10.2.0` | JWT tokens |
| **passport** | `^0.7.0` | نظام المصادقة |
| **passport-jwt** | `^4.0.1` | استراتيجية JWT |

### الأمان والأداء

| المكتبة | الإصدار | الاستخدام |
|---------|----------|-----------|
| **helmet** | `^7.1.0` | HTTP headers الأمان |
| **cors** | `^2.8.5` | Cross-Origin Resource Sharing |
| **@nestjs/throttler** | `^5.0.1` | تحديد معدل الطلبات |
| **express-rate-limit** | `^7.1.5` | حماية من الهجمات |
| **bcrypt** | `^5.1.1` | تشفير كلمات المرور |

### التحقق والتحويل

| المكتبة | الإصدار | الاستخدام |
|---------|----------|-----------|
| **class-validator** | `^0.14.0` | التحقق من البيانات |
| **class-transformer** | `^0.5.1` | تحويل الكائنات |

### التطوير والاختبار

| المكتبة | الإصدار | الاستخدام |
|---------|----------|-----------|
| **typescript** | `^5.9.3` | TypeScript |
| **@types/node** | `^20.10.6` | أنواع Node.js |
| **jest** | `^29.7.0` | إطار الاختبار |
| **supertest** | `^6.3.3` | اختبار API |

---

## 🗄️ مخطط قاعدة البيانات

### مخططات MongoDB

#### 1. User Schema (المستخدمين)

```typescript
@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  username: string;

  @Prop({ required: true, unique: true, trim: true })
  authCode: string; // رمز 70 حرف فريد

  @Prop({ trim: true })
  refreshToken?: string;

  @Prop({ trim: true })
  firstName?: string;

  @Prop({ trim: true })
  lastName?: string;

  @Prop()
  avatar?: string;

  @Prop()
  bio?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [{ type: String, ref: 'User' }], default: [] })
  followers: string[];

  @Prop({ type: [{ type: String, ref: 'User' }], default: [] })
  following: string[];

  @Prop({ type: [{ type: String, ref: 'User' }], default: [] })
  friends: string[];

  @Prop({ type: [{ type: String, ref: 'Post' }], default: [] })
  pinnedPosts: string[];
}
```

#### 2. Post Schema (المنشورات)

```typescript
@Schema({ timestamps: true })
export class Post {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  author: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 5000 })
  content: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  likes: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Post' }], default: [] })
  comments: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Group' })
  group?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Page' })
  page?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Post' })
  originalPost?: Types.ObjectId;

  @Prop({ default: false })
  isRepost: boolean;

  @Prop({ default: false })
  isDeleted: boolean;
}
```

#### 3. Group Schema (المجموعات)

```typescript
@Schema({ timestamps: true })
export class Group {
  @Prop({ required: true, trim: true, maxlength: 100 })
  name: string;

  @Prop({ trim: true, maxlength: 500 })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  admin: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  admins: Types.ObjectId[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  members: Types.ObjectId[];

  @Prop({ enum: ['public', 'private'], default: 'public' })
  privacy: string;

  @Prop({ default: true })
  showMemberNames: boolean;

  @Prop({ default: false })
  allowMembersToPost: boolean;
}
```

### العلاقات بين الجداول

```mermaid
graph TD
    User[👤 User] -->|pinnedPosts| Post[📝 Post]
    User -->|followers/following| User
    User -->|admin| Group[👥 Group]
    User -->|admins/members| Group
    Post -->|author| User
    Post -->|group| Group
    Post -->|originalPost| Post
    Post -->|likes| User
    Post -->|comments| Comment[💬 Comment]
    Comment -->|author| User
    Comment -->|post| Post
    Group -->|posts| Post
    Group -->|conversation| Conversation[💬 Conversation]
    Conversation -->|participants| User
    Conversation -->|messages| Message[📨 Message]
    Message -->|sender| User
```

---

## 🔐 نظام المصادقة والصلاحيات

### 1. نظام رمز المصادقة (Auth Code)

#### كيفية عمل النظام:

```mermaid
sequenceDiagram
    participant U as المستخدم
    participant FE as الفرونت اند
    participant BE as الباك اند
    participant DB as قاعدة البيانات

    U->>FE: إدخال البيانات (اسم، اسم العائلة)
    FE->>BE: POST /auth/register
    BE->>BE: توليد رمز 70 حرف
    BE->>DB: حفظ رمز المصادقة
    BE->>FE: إرجاع رمز المصادقة
    FE->>U: عرض الرمز للمستخدم

    U->>FE: إدخال رمز المصادقة
    FE->>BE: POST /auth/login
    BE->>DB: التحقق من الرمز
    BE->>BE: توليد JWT tokens
    BE->>FE: إرجاع access_token و refresh_token
```

#### مولد رمز المصادقة:

```typescript
// في code-generator.util.ts
static generateUniqueCode(): string {
  const timestamp = Date.now().toString();  // 13 حرف
  const randomPartLength = 70 - timestamp.length;  // 57 حرف
  let result = timestamp;

  for (let i = 0; i < randomPartLength; i++) {
    result += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      .charAt(Math.floor(Math.random() * 62));
  }

  return result;  // إجمالي: 70 حرف فريد
}
```

### 2. نظام JWT Tokens

#### إعدادات التوكن:

```typescript
// Access Token: قصير العمر للأمان
const accessToken = this.jwtService.sign(payload, {
  secret,
  expiresIn: '1h'  // ساعة واحدة
});

// Refresh Token: طويل العمر للتجديد
const refreshToken = this.jwtService.sign(refreshTokenPayload, {
  secret: refreshSecret,
  expiresIn: '30d'  // 30 يوم
});
```

#### Guards الحماية:

```typescript
// JWT Auth Guard - لجميع الطلبات المحمية
@UseGuards(JwtAuthGuard)
@Get('profile')
getProfile(@Request() req: any) {
  return this.authService.getProfile(req.user.userId);
}

// JWT Refresh Guard - لتجديد التوكن
@UseGuards(JwtRefreshGuard)
@Post('refresh')
refresh(@Request() req: any) {
  return this.authService.refreshToken(req.body.refreshToken);
}
```

---

## 🌐 نقاط نهاية API

### Base URL
```
http://localhost:3000/api
```

### 📋 قائمة شاملة بنقاط النهاية

#### 1. Auth Endpoints (المصادقة)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/auth/register` | تسجيل مستخدم جديد | ❌ |
| `POST` | `/auth/login` | تسجيل دخول | ❌ |
| `POST` | `/auth/refresh` | تجديد التوكن | ❌ |
| `GET` | `/auth/profile` | الحصول على الملف الشخصي | ✅ |
| `PATCH` | `/auth/profile` | تحديث الملف الشخصي | ✅ |
| `PATCH` | `/auth/auth-code` | تحديث رمز المصادقة | ✅ |
| `GET` | `/auth/verify` | التحقق من صحة التوكن | ✅ |

#### 2. Users Endpoints (المستخدمين)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/users` | قائمة المستخدمين | ❌ |
| `GET` | `/users/search` | البحث في المستخدمين | ✅ |
| `GET` | `/users/friends` | قائمة الأصدقاء | ✅ |
| `GET` | `/users/:id` | تفاصيل مستخدم | ❌ |
| `PATCH` | `/users/:id` | تحديث مستخدم | ✅ |
| `DELETE` | `/users/:id` | حذف مستخدم | ✅ |
| `POST` | `/users/:id/follow` | متابعة مستخدم | ✅ |
| `POST` | `/users/:id/unfollow` | إلغاء متابعة | ✅ |
| `POST` | `/users/pin/:postId` | تثبيت منشور | ✅ |
| `DELETE` | `/users/pin/:postId` | إلغاء تثبيت | ✅ |

#### 3. Posts Endpoints (المنشورات)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/posts` | قائمة المنشورات | ❌ |
| `GET` | `/posts/user/:userId` | منشورات مستخدم | ❌ |
| `GET` | `/posts/group/:groupId` | منشورات مجموعة | ✅ |
| `GET` | `/posts/page/:pageId` | منشورات صفحة | ✅ |
| `GET` | `/posts/:id` | تفاصيل منشور | ❌ |
| `POST` | `/posts` | إنشاء منشور | ✅ |
| `PATCH` | `/posts/:id` | تحديث منشور | ✅ |
| `DELETE` | `/posts/:id` | حذف منشور | ✅ |
| `POST` | `/posts/:id/like` | إعجاب بمنشور | ✅ |
| `POST` | `/posts/:id/share` | مشاركة منشور | ✅ |
| `POST` | `/posts/:id/repost` | إعادة نشر | ✅ |
| `POST` | `/posts/upload` | رفع ملفات | ✅ |

#### 4. Groups Endpoints (المجموعات)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/groups` | قائمة المجموعات | ✅ |
| `GET` | `/groups/my-groups` | مجموعاتي | ✅ |
| `GET` | `/groups/:id` | تفاصيل مجموعة | ✅ |
| `POST` | `/groups` | إنشاء مجموعة | ✅ |
| `PATCH` | `/groups/:id` | تحديث مجموعة | ✅ |
| `DELETE` | `/groups/:id` | حذف مجموعة | ✅ |
| `POST` | `/groups/:id/join` | الانضمام للمجموعة | ✅ |
| `POST` | `/groups/:id/leave` | مغادرة المجموعة | ✅ |
| `POST` | `/groups/:id/add-member` | إضافة عضو | ✅ |
| `POST` | `/groups/:id/remove-member` | إزالة عضو | ✅ |
| `POST` | `/groups/:id/promote-admin` | ترقية أدمن | ✅ |
| `POST` | `/groups/:id/demote-admin` | إنزال أدمن | ✅ |
| `POST` | `/groups/:id/request-join` | طلب انضمام | ✅ |
| `GET` | `/groups/:id/join-requests` | طلبات الانضمام | ✅ |
| `POST` | `/groups/:id/approve-request` | قبول طلب | ✅ |
| `POST` | `/groups/:id/reject-request` | رفض طلب | ✅ |
| `PATCH` | `/groups/:id/settings` | تحديث إعدادات | ✅ |
| `POST` | `/groups/:id/pin/:postId` | تثبيت منشور | ✅ |
| `DELETE` | `/groups/:id/pin/:postId` | إلغاء تثبيت | ✅ |

### أمثلة على الطلبات والاستجابات

#### 1. تسجيل مستخدم جديد

**Request:**
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "johndoe",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response:**
```json
{
  "message": "تم التسجيل بنجاح",
  "authCode": "1643723456789ABCDEFGHIJK...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "johndoe",
    "firstName": "John",
    "lastName": "Doe",
    "authCode": "1643723456789ABCDEFGHIJK..."
  }
}
```

#### 2. تسجيل الدخول

**Request:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "authCode": "1643723456789ABCDEFGHIJK..."
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "johndoe",
    "firstName": "John",
    "lastName": "Doe"
  },
  "message": "تم تسجيل الدخول بنجاح"
}
```

#### 3. إنشاء منشور

**Request:**
```http
POST /api/posts
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "content": "منشور تجريبي",
  "images": ["https://example.com/image.jpg"]
}
```

**Response:**
```json
{
  "statusCode": 201,
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "author": "507f1f77bcf86cd799439011",
    "content": "منشور تجريبي",
    "images": ["https://example.com/image.jpg"],
    "likes": [],
    "comments": [],
    "shares": [],
    "isRepost": false,
    "isDeleted": false,
    "createdAt": "2024-01-20T22:00:00.000Z",
    "updatedAt": "2024-01-20T22:00:00.000Z"
  }
}
```

#### 4. إعادة نشر منشور

**Request:**
```http
POST /api/posts/507f1f77bcf86cd799439012/repost
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "additionalContent": "أحب هذا المنشور!"
}
```

**Response:**
```json
{
  "statusCode": 201,
  "data": {
    "_id": "507f1f77bcf86cd799439013",
    "author": "507f1f77bcf86cd799439011",
    "content": "🔄 تم إعادة نشر هذا المنشور",
    "originalPost": "507f1f77bcf86cd799439012",
    "isRepost": true,
    "isDeleted": false,
    "createdAt": "2024-01-20T22:01:00.000Z",
    "updatedAt": "2024-01-20T22:01:00.000Z"
  }
}
```

---

## ⚙️ إجراءات النشر والتهيئة

### متطلبات النظام

- **Node.js**: `>=16.0.0`
- **npm**: `>=8.0.0`
- **MongoDB**: `>=5.0`
- **TypeScript**: `>=5.0`

### خطوات التثبيت

```bash
# 1. استنساخ المشروع
git clone <repository-url>
cd backend

# 2. تثبيت التبعيات
npm install

# 3. إعداد متغيرات البيئة
cp .env.example .env
# قم بتحرير .env حسب احتياجاتك

# 4. تشغيل قاعدة البيانات
# تأكد من تشغيل MongoDB على المنفذ الافتراضي

# 5. تشغيل التطبيق
npm run start:dev
```

### متغيرات البيئة (.env)

```env
# قاعدة البيانات
MONGODB_URI=mongodb://localhost:27017/social_connect

# JWT Secrets
JWT_SECRET=your-super-secret-jwt-key-here
JWT_REFRESH_SECRET=your-refresh-token-secret-here

# خادم
PORT=3000
NODE_ENV=development

# حدود معدل الطلبات
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100

# رفع الملفات
MAX_FILE_SIZE=104857600  # 100MB
UPLOAD_DEST=./uploads
```

### إعداد قاعدة البيانات

```javascript
// إنشاء indexes للأداء
db.users.createIndex({ "username": 1 }, { unique: true });
db.users.createIndex({ "authCode": 1 }, { unique: true });
db.posts.createIndex({ "author": 1, "createdAt": -1 });
db.posts.createIndex({ "isDeleted": 1 });
db.groups.createIndex({ "name": 1 });
db.groups.createIndex({ "admin": 1 });
```

### إعداد الخادم للإنتاج

```bash
# بناء التطبيق
npm run build

# تشغيل الإنتاج
npm run start:prod

# أو استخدام PM2
npm install -g pm2
pm2 start dist/main.js --name "social-connect-api"
```

---

## 🔍 سجلات الأخطاء واستكشاف الأخطاء

### أنواع الأخطاء الشائعة

#### 1. أخطاء قاعدة البيانات

```typescript
// في الملفات .service.ts
try {
  await this.userModel.findById(userId);
} catch (error) {
  console.error('[UsersService] Database error:', error);
  throw new InternalServerErrorException('خطأ في قاعدة البيانات');
}
```

#### 2. أخطاء التحقق من البيانات

```typescript
// في DTOs
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePostDto {
  @IsNotEmpty({ message: 'محتوى المنشور مطلوب' })
  @IsString()
  @MaxLength(5000, { message: 'المحتوى طويل جداً' })
  content: string;
}
```

#### 3. أخطاء المصادقة

```typescript
// في Guards
if (!user) {
  throw new UnauthorizedException('رمز المصادقة غير صحيح');
}
```

### مستويات السجل

```typescript
// معلومات عامة
console.log('[AuthService] User logged in:', userId);

// تحذيرات
console.warn('[PostsService] Post not found:', postId);

// أخطاء
console.error('[GroupsService] Group creation failed:', error);

// تصحيح
if (process.env.NODE_ENV === 'development') {
  console.debug('[ApiService] Request details:', requestData);
}
```

### مراقبة الأداء

```typescript
// في main.ts - إضافة middleware لقياس الأداء
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${duration}ms`);
  });
  next();
});
```

---

## 🛡️ الأمان والحماية

### 1. تشفير كلمات المرور (إن وجدت)

```typescript
// استخدام bcrypt
import * as bcrypt from 'bcrypt';

const saltRounds = 12;
const hashedPassword = await bcrypt.hash(password, saltRounds);
const isValid = await bcrypt.compare(password, hashedPassword);
```

### 2. تحديد معدل الطلبات

```typescript
// في app.module.ts
ThrottlerModule.forRoot({
  ttl: 60,    // 60 ثانية
  limit: 100, // 100 طلب كحد أقصى
})
```

### 3. CORS Configuration

```typescript
// في main.ts
app.enableCors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://yourdomain.com']
    : ['http://localhost:8080', 'http://localhost:3000'],
  credentials: true,
});
```

### 4. Headers الأمان

```typescript
// في main.ts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
```

---

## 🚀 تحسينات الأداء

### 1. فهرسة قاعدة البيانات

```javascript
// في MongoDB
db.posts.createIndex({ "author": 1, "createdAt": -1 });
db.posts.createIndex({ "group": 1, "createdAt": -1 });
db.posts.createIndex({ "isDeleted": 1 });
db.users.createIndex({ "username": 1 }, { unique: true });
db.groups.createIndex({ "privacy": 1 });
```

### 2. التخزين المؤقت (Caching)

```typescript
// في PostsService
@Injectable()
export class PostsService {
  private cache = new Map<string, any>();

  async findAll(skip = 0, limit = 20) {
    const cacheKey = `posts_${skip}_${limit}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const posts = await this.postModel
      .find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    this.cache.set(cacheKey, posts);
    return posts;
  }
}
```

### 3. تحميل الصور المؤجل (Lazy Loading)

```typescript
// في PostsController
@Get()
async findAll(
  @Query('skip') skip?: string,
  @Query('limit') limit?: string,
) {
  const posts = await this.postsService.findAll(
    skip ? parseInt(skip) : 0,
    limit ? parseInt(limit) : 20,
  );

  // تحميل الصور الكبيرة بشكل منفصل
  return posts.map(post => ({
    ...post.toObject(),
    images: post.images.map(img => this.optimizeImageUrl(img)),
  }));
}
```

---

## 🧪 الاختبارات

### إعداد الاختبارات

```typescript
// في jest-e2e.json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "src",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "collectCoverageFrom": ["**/*.(t|j)s"],
  "coverageDirectory": "../coverage",
  "testEnvironment": "node"
}
```

### مثال اختبار E2E

```typescript
// في auth.e2e-spec.ts
describe('Auth (e2e)', () => {
  it('/auth/register (POST)', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('authCode');
        expect(res.body.authCode).toHaveLength(70);
      });
  });
});
```

### تشغيل الاختبارات

```bash
# اختبارات الوحدة
npm run test

# اختبارات E2E
npm run test:e2e

# اختبارات مع تغطية
npm run test:cov
```

---

## 📊 مراقبة النظام

### 1. Health Check Endpoint

```typescript
// في app.controller.ts
@Get('health')
getHealth() {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  };
}
```

### 2. مقاييس الأداء

```typescript
// في main.ts - إضافة مقاييس
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.register(),
    // ... باقي الوحدات
  ],
})
export class AppModule {}
```

### 3. سجلات مفصلة

```typescript
// في main.ts
app.useLogger(app.get(Logger));
app.useGlobalInterceptors(new LoggingInterceptor());
```

---

## 🔄 API Versioning

### إصدارات API المستقبلية

```typescript
// في main.ts
app.setGlobalPrefix('api/v1');

// أو للتوافق مع الإصدارات المتعددة
@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {}
```

---

## 📚 المراجع والموارد

### روابط مفيدة

- [NestJS Documentation](https://docs.nestjs.com/)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Mongoose Documentation](https://mongoosejs.com/)
- [JWT.io](https://jwt.io/)

### أنماط التصميم المستخدمة

- **Repository Pattern**: للوصول للبيانات
- **DTO Pattern**: لنقل البيانات
- **Guard Pattern**: للمصادقة والصلاحيات
- **Interceptor Pattern**: لمعالجة الاستجابات

### معايير الجودة

- **SOLID Principles**: مبادئ التصميم الموجه للكائنات
- **DRY Principle**: عدم تكرار الكود
- **Clean Architecture**: بنية نظيفة وقابلة للصيانة

---

## 👥 دليل المساهمة

### إضافة خدمة جديدة

1. **إنشاء المخطط (Schema)**
2. **إنشاء DTOs**
3. **إنشاء الخدمة (Service)**
4. **إنشاء المتحكم (Controller)**
5. **إضافة الوحدة (Module)**
6. **كتابة الاختبارات**

### مثال: إضافة خدمة جديدة

```typescript
// 1. إنشاء المخطط
@Schema()
export class Notification {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  message: string;

  @Prop({ default: false })
  read: boolean;
}

// 2. إنشاء DTO
export class CreateNotificationDto {
  @IsNotEmpty()
  userId: string;

  @IsNotEmpty()
  message: string;
}

// 3. إنشاء الخدمة
@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
  ) {}

  async create(createNotificationDto: CreateNotificationDto) {
    const notification = new this.notificationModel(createNotificationDto);
    return notification.save();
  }
}
```

---

*تم إنشاء هذا الدليل بواسطة فريق تطوير Social Connect Backend - NestJS & MongoDB* 🏗️