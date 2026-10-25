# توثيق الـBackend — النسخة الأولى (V1)

مرجع هندسي مختصر: النطاق، القواعد الأساسية، المراحل، ومعايير الإنجاز. الهدف نسخة أولى صغيرة وسليمة، وكل نسخة بعدها تضيف حاجات صغيرة بس.

## 1. النطاق

**داخل V1:**

- تسجيل دخول بأسهل طريقة (Firebase Auth)
- تصفح المنشورات كزائر من غير حساب
- منشورات: نص، صور، فيديو
- Feed عام مرتب بالأحدث فالأقدم
- تعديل الملف الشخصي ومنشورات المستخدم
- الإبلاغ عن منشور مخالف + إخفاء وقفل تلقائي

**خارج V1 عمدًا:** لايكات، تعليقات، متابعة، إشعارات، بحث، لوحة admin، ترجمة/معالجة فيديو.

## 2. المبادئ الحاكمة

1. **الأبسط اللي يشتغل:** مفيش microservices ولا queues ولا cache طالما مفيش مشكلة فعلية.
2. **Modular monolith:** تطبيق NestJS واحد، مقسّم modules حسب الميزة.
3. **الـDB هي مصدر الحقيقة:** الحالة (`status`) كلها في الداتابيز، والمراجعة اليدوية بتغيّرها مباشرة.
4. **Soft state:** مفيش مسح فعلي لمنشور أو حساب، كله بـ`status` عشان الرجوع سهل.
5. **الأمان افتراضي:** أي endpoint مقفول إلا اللي اتحدد صراحةً إنه عام.
6. **السيرفر مش بيستلم ملفات:** الميديا بترفع مباشرة للـStorage.

## 3. التقنيات

- **Runtime:** NestJS + TypeScript
- **DB:** PostgreSQL + Prisma (migrations فقط، من غير `db push` في الإنتاج)
- **Auth:** Firebase Auth، والـBackend بيتحقق من الـID Token بـ`firebase-admin`
- **Storage:** Cloudflare R2 أو S3 عن طريق presigned URLs
- **أساسيات:** `class-validator`، `@nestjs/throttler`، `@nestjs/config`، Swagger، `helmet`
- **Logging:** logger منظم (JSON) مع request id

## 4. القواعد الأساسية (Business Rules)

### 4.1 المصادقة والصلاحيات

- الـclient يبعت `Authorization: Bearer <Firebase ID Token>`.
- الـguard يتحقق من الـtoken، ويجيب اليوزر بالـ`firebaseUid`، وينشئه أول مرة (upsert لتفادي الـrace).
- **الزائر:** قراءة فقط (Feed، منشور فردي، بروفايل عام، منشورات مستخدم). الـtoken اختياري في endpoints دي.
- **المسجّل:** نشر، تعديل، حذف (منشوراته بس)، إبلاغ، تعديل بروفايله.
- **حساب مقفول (`SUSPENDED`):** الـguard يرفضه بـ403 وكود `ACCOUNT_SUSPENDED` في كل request. الفحص من الـDB في كل مرة، مش من الـtoken.

### 4.2 المنشورات

- المنشور لازم فيه نص أو ميديا على الأقل، والحد الأقصى للنص يتحدد في الـconfig.
- الحالات: `ACTIVE | HIDDEN | DELETED`.
- المستخدم يعدّل ويحذف منشوراته بس. الحذف soft (`DELETED`).
- `HIDDEN` و`DELETED` يرجّعوا 404 للكل في `GET /posts/:id`. صاحب المنشور بس يشوف حالة `HIDDEN` في قايمة منشوراته.

### 4.3 الميديا

1. الـclient يطلب `POST /media/presign` (النوع، الحجم، content-type).
2. السيرفر يتحقق من النوع والحجم المسموح ويرجّع `uploadUrl` + `key`.
3. الـclient يرفع مباشرة للـStorage.
4. عند `POST /posts` الـclient يبعت الـ`keys`، والسيرفر يتأكد إنها موجودة (HEAD) وإنها تخص نفس المستخدم.

- **القيم المبدئية (تتأكد):** صورة حتى 5MB، فيديو حتى 50MB وحتى 60 ثانية، من غير transcoding.
- Content-types مسموحة بقايمة بيضاء بس.

### 4.3 الـFeed

- `GET /feed?cursor=&limit=` عام من غير token.
- الترتيب: `createdAt DESC, id DESC`، بـcursor pagination (مش offset).
- الـlimit الافتراضي 20 والأقصى 50.
- يظهر فقط المنشور `ACTIVE` اللي صاحبه `ACTIVE`.

### 4.4 الإبلاغ والـModeration

- الإبلاغ للمسجّلين بس. بلاغ واحد لكل مستخدم على المنشور (`UNIQUE(postId, reporterId)`)، ومينفعش يبلّغ عن منشوره.
- الأسباب enum ثابتة (مثلًا: محتوى مسيء للدين، عنف، سبام، أخرى).
- **7 بلاغات** على المنشور ← `HIDDEN` تلقائيًا.
- **15 بلاغ** على المستخدم ← `SUSPENDED` تلقائيًا. (المحسوب: مجموع البلاغات على منشوراته، تتأكد مع المهندس.)
- كل ده في **transaction واحدة** بعمليات atomic: إدخال البلاغ ← `reportCount = reportCount + 1` للمنشور وصاحبه ← فحص الـthreshold على القيم الراجعة (مش قيم متخزنة قبل).
- المراجعة يدوية من الداتابيز (انظر قسم 8).

### 4.5 الملف الشخصي

- `GET /users/:id` عام (404 لو الحساب مقفول).
- `PATCH /users/me`: الاسم، النبذة، الصورة (عن طريق نفس مسار الميديا).

## 5. نموذج البيانات

- **users:** `id, firebaseUid (unique), displayName, bio, avatarKey, status, reportCount, createdAt`
- **posts:** `id, authorId, text, status, reportCount, createdAt, updatedAt`
- **post\_media:** `id, postId, key, type (IMAGE|VIDEO), position`
- **reports:** `id, postId, reporterId, reason, createdAt` مع `UNIQUE(postId, reporterId)`

**Indexes مطلوبة:** `users(firebaseUid)` unique، `posts(status, createdAt DESC, id DESC)`، `posts(authorId, createdAt DESC)`، `reports(postId)`.

## 6. الـAPI (ملخص)

- `GET /me` — مسجّل
- `PATCH /users/me` — مسجّل
- `GET /users/:id` و`GET /users/:id/posts` — عام
- `POST /media/presign` — مسجّل
- `POST /posts` و`PATCH /posts/:id` و`DELETE /posts/:id` — مسجّل (صاحب المنشور)
- `GET /posts/:id` — عام
- `GET /feed` — عام
- `POST /posts/:id/report` — مسجّل
- `GET /health` — عام

**شكل الأخطاء موحّد:** `{ statusCode, code, message }` عن طريق global exception filter.

## 7. القواعد الهندسية

- **الهيكل:** modules `auth, users, posts, media, feed, reports` + `common` (guards، filters، utils) + `config`.
- **Validation:** DTOs مع `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`).
- **فلتر الـstatus** يتحط في طبقة الـqueries (service/repository) مش في الـcontroller، عشان مايتنسيش في endpoint.
- **الـConfig:** متغيرات البيئة متحقق منها عند الإقلاع، ومفيش secrets في الـrepo.
- **Rate limiting:** عام (مثلًا 100 طلب/دقيقة للـIP)، وأشد على `report` و`media/presign`.
- **الأمان:** `helmet`، CORS بقايمة origins محددة، مفيش بيانات حساسة في الـlogs.
- **الاختبارات:** unit tests لقواعد الـmoderation، وe2e لمسارات: auth، نشر، feed، إبلاغ. من غير مبالغة في الـcoverage.
- **الـGit:** `main` محمي، feature branches، PR لكل تغيير، CI (lint + test + build) لازم يعدّي.
- **البيئات:** `local` و`staging` (وبعدها `production`).

## 8. تشغيل المراجعة اليدوية (Runbook)

- **استرجاع منشور:** `status = ACTIVE` و`reportCount = 0` للمنشور، وإنقاص `reportCount` صاحبه بقيمة بلاغات المنشور. (جدول `reports` يفضل زي ما هو عشان نفس المبلّغين مايبلغوش تاني.)
- **فك قفل حساب:** `status = ACTIVE` و`reportCount = 0` لليوزر.
- **حذف نهائي (نادر):** من الداتابيز، بعد قرار واضح.

## 9. المراحل

### المرحلة 0: الأساس

- Repo، NestJS، Prisma + PostgreSQL (Docker محليًا)، config، lint، CI، exception filter، `/health`.
- **Done لما:** المشروع يشتغل محليًا بأمر واحد، والـCI أخضر.

### المرحلة 1: الهوية والملف الشخصي

- Firebase guard (إجباري + اختياري)، إنشاء اليوزر أول مرة، فحص `status`، `GET /me`، `PATCH /users/me`، `GET /users/:id`.
- **Done لما:** token صالح يدخل، token غلط يترفض، حساب `SUSPENDED` يترفض.

### المرحلة 2: المنشورات والميديا

- `media/presign`، CRUD للمنشورات، التحقق من الـkeys، `GET /users/:id/posts`.
- **Done لما:** نشر نص وصورة وفيديو يشتغل، وتعديل/حذف منشور غيرك مرفوض.

### المرحلة 3: الـFeed

- `GET /feed` بـcursor، الفلترة بالـstatus، الـindexes.
- **Done لما:** الـpagination ثابتة مع إضافة منشورات جديدة أثناء التصفح، والـfeed يشتغل من غير token.

### المرحلة 4: الإبلاغ والـModeration

- `POST /posts/:id/report`، الـtransaction، thresholds (7 / 15)، آثار الإخفاء والقفل على كل الـendpoints.
- **Done لما:** اختبار e2e يثبت: بلاغ مكرر مرفوض، 7 بلاغات تخفي المنشور، 15 تقفل الحساب، والرجوع بتغيير `status`.

### المرحلة 5: التجهيز والتسليم

- Rate limits، مراجعة الـindexes، Swagger كامل، seed لبيانات تجريبية، نشر على staging، توثيق الـRunbook.
- **Done لما:** المهندس يقدر يجرّب كل الـAPI من Swagger على staging.

## 10. نقاط مفتوحة للتأكيد

1. حد الـ15 بلاغ على المستخدم: مجموع بلاغات منشوراته؟
2. قيم حدود الميديا (الحجم، المدة، عدد الصور في المنشور).
3. طرق الدخول في V1: Google + Apple فقط، ولا رقم التليفون كمان (تكلفة SMS)؟ ولو iOS يبقى Apple Sign-In إجباري.
4. قايمة أسباب الإبلاغ النهائية.
5. مين يراجع البلاغات وبأي دورية؟

## 11. المخاطر المعروفة (مقبولة في V1)

- بلاغات كاذبة منظّمة ممكن تقفل حساب بريء. الحل المؤقت: الرجوع اليدوي، وبعدين نضيف admin وحد للتكرار في نسخة لاحقة.
- الفيديو من غير transcoding: جودة وحجم متفاوتين.
- بيانات الهوية عند Google، والانتقال منها بعدين مجهود.
