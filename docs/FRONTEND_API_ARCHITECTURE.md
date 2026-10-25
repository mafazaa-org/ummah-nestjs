# المخطط المعماري لطبقة الـ APIs والشبكة في الواجهة الأمامية (Frontend API & Services Architecture)
## Ummah Platform V1 — Enterprise Frontend Architecture

> **المنهجية الهندسية:** Staff / Principal Frontend Architect (30+ Years Experience Standards)  
> **القواعد الصارمة:**
> 1. ألا يتجاوز أي ملف 250 سطراً على الإطلاق (Strict Max 250 LOC).
> 2. عزل كامل للمسؤوليات (Clean Code & Separation of Concerns): طبقة استدعاء الـ HTTP معزولة تماماً عن مكونات الـ UI.
> 3. دعم كامل للأنواع (Strict TypeScript) المستخرجة من [openapi-spec.json](file:///c:/projects/mafaza/new%20ommah%20app/docs/openapi-spec.json).
> 4. معالجة موحدة وشاملة للأخطاء والـ Interceptors.

---

## 1. الهيكل الهيكلي لشجرة طبقة الـ API (Directory Layout)

```text
src/api/
├── client.ts                  # Axios / Fetch Base Instance & Global Config (< 90 LOC)
├── interceptors/
│   ├── auth.interceptor.ts    # حقن Firebase ID Token مع كل طلب (< 80 LOC)
│   └── error.interceptor.ts   # تحويل الأخطاء وتوجيه 403 Suspended (< 110 LOC)
├── query-keys.ts              # Query Key Factory لـ TanStack Query (< 60 LOC)
├── types/
│   ├── generated.d.ts         # الأنواع المولدة تلقائياً من OpenAPI (< 200 LOC)
│   └── api-errors.ts          # أنواع الأخطاء واستجابات السيرفر (< 50 LOC)
└── endpoints/
    ├── auth.api.ts            # GET /auth/me (< 60 LOC)
    ├── users.api.ts           # PATCH /users/me, GET /users/:id, GET /users/:id/posts (< 90 LOC)
    ├── media.api.ts           # POST /media/presign, S3 Direct Upload (< 110 LOC)
    ├── posts.api.ts           # POST /posts, GET /posts/:id, PATCH, DELETE (< 100 LOC)
    ├── feed.api.ts            # GET /feed (< 70 LOC)
    ├── reports.api.ts         # POST /posts/:id/report (< 60 LOC)
    └── health.api.ts          # GET /health (< 40 LOC)
```

---

## 2. النواة الأساسية للشبكة والـ Interceptors

### 2.1 عميل الـ HTTP المركزي (`src/api/client.ts`)
* مسؤول عن ضبط `baseURL`، ترويسات `Content-Type: application/json`، المهلة الزمنية `timeout: 15000ms`.
* تسجيل الـ Interceptors دون تشويش الـ Business Logic.

```typescript
import axios from 'axios';
import { setupAuthInterceptor } from './interceptors/auth.interceptor';
import { setupErrorInterceptor } from './interceptors/error.interceptor';

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// تثبيت معالجات التوكن والأخطاء
setupAuthInterceptor(apiClient);
setupErrorInterceptor(apiClient);
```

---

### 2.2 حقن التوكن الآلي (`src/api/interceptors/auth.interceptor.ts`)
* يستمع لحالة Firebase Auth؛ إذا كان المستخدم مسجلاً، يجلب الـ `idToken` الصالح ويحقنه في ترويسة `Authorization: Bearer <token>`.
* في حالة المسارات العامة (Public) مثل `GET /feed`، إذا لم يتوفر توكن، يمرر الطلب بشكل طبيعي (Token Immunity).

```typescript
import { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { getFirebaseAuthToken } from '@/lib/firebase';

export function setupAuthInterceptor(client: AxiosInstance): void {
  client.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      try {
        const token = await getFirebaseAuthToken();
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (err) {
        // مسار عام أو خطأ مؤقت في جلب التوكن: يمر الطلب كـ Guest
        console.warn('[AuthInterceptor] Proceeding without token:', err);
      }
      return config;
    },
    (error) => Promise.reject(error),
  );
}
```

---

### 2.3 المعالج المركزي للأخطاء (`src/api/interceptors/error.interceptor.ts`)
* يلتقط أخطاء السيرفر الموحدة `{ statusCode, code, message }`.
* **قاعدة الحظر الحاسم (403 `ACCOUNT_SUSPENDED`):** يقوم فورياً بإعادة توجيه المستخدم لشاشة `/suspended` ومسح الجلسة المحلية لمنع إرسال طلبات فاشلة متتالية.
* **إعادة المصادقة (401 `UNAUTHENTICATED` / `INVALID_TOKEN`):** يقوم بإجبار Firebase SDK على عمل `getIdToken(true)` لتجديد التوكن وإعادة الطلب مرة واحدة (Retry).

```typescript
import { AxiosError, AxiosInstance } from 'axios';
import { ApiErrorResponse } from '../types/api-errors';

export function setupErrorInterceptor(client: AxiosInstance): void {
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<ApiErrorResponse>) => {
      const status = error.response?.status;
      const code = error.response?.data?.code;

      if (status === 403 && code === 'ACCOUNT_SUSPENDED') {
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/suspended')) {
          window.location.href = '/suspended';
        }
      }

      return Promise.reject(error.response?.data || {
        statusCode: status || 500,
        code: 'NETWORK_ERROR',
        message: error.message || 'حدث خطأ في الاتصال بالشبكة',
      });
    },
  );
}
```

---

## 3. محرك الاستعلامات والكاشينج (TanStack Query Key Factory)

### 3.1 معيار الـ Query Keys الموحد (`src/api/query-keys.ts`)
تجنب كتابة سلاسل نصوص عشوائية (`string[]`) التي تسبب أخطاء الـ Invalidation:

```typescript
export const queryKeys = {
  auth: {
    me: () => ['auth', 'me'] as const,
  },
  users: {
    detail: (id: string) => ['users', 'detail', id] as const,
    posts: (id: string) => ['users', 'posts', id] as const,
  },
  posts: {
    detail: (id: string) => ['posts', 'detail', id] as const,
  },
  feed: {
    infinite: () => ['feed', 'infinite'] as const,
  },
} as const;
```

---

## 4. الخدمات وهوكات تدفق البيانات (Feature Hooks & API Endpoints)

### 4.1 دورة الرفع المباشر لـ S3 مع شريط التقدم (`src/hooks/useDirectUpload.ts`)
* يعالج خطوتي الرفع دون تحميل الباك إند باستهلاك الذاكرة.
* يوفر نسبة التقدم المئوية `progress (0-100%)`.

```typescript
import { useState } from 'react';
import axios from 'axios';
import { mediaApi } from '@/api/endpoints/media.api';

interface UploadParams {
  file: File;
  type: 'IMAGE' | 'VIDEO';
  purpose: 'POST' | 'AVATAR';
}

export function useDirectUpload() {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const upload = async ({ file, type, purpose }: UploadParams): Promise<string> => {
    setIsUploading(true);
    setProgress(0);

    try {
      // 1. طلب الرابط الموقع
      const presign = await mediaApi.presign({
        type,
        contentType: file.type,
        sizeBytes: file.size,
        purpose,
      });

      // 2. الرفع المباشر إلى S3 عبر PUT
      await axios.put(presign.uploadUrl, file, {
        headers: { 'Content-Type': file.type },
        onUploadProgress: (event) => {
          if (event.total) {
            setProgress(Math.round((event.loaded * 100) / event.total));
          }
        },
      });

      return presign.key;
    } finally {
      setIsUploading(false);
    }
  };

  return { upload, progress, isUploading };
}
```

---

### 4.2 هوك الفيد العام والتصفح اللانهائي (`src/hooks/useInfiniteFeed.ts`)
* يستخدم `useInfiniteQuery` مع الـ Keyset Cursor `nextCursor`.
* أداء لحظي ودعم كامل للسحب للتحديث `refetch`.

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';
import { feedApi } from '@/api/endpoints/feed.api';
import { queryKeys } from '@/api/query-keys';

export function useInfiniteFeed(limit = 20) {
  return useInfiniteQuery({
    queryKey: queryKeys.feed.infinite(),
    queryFn: ({ pageParam }) => feedApi.getFeed({ limit, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}
```

---

### 4.3 هوك إنشاء المنشور مع التحديث اللحظي (`src/hooks/useCreatePost.ts`)
* ينفذ `POST /posts`.
* عند النجاح: يقوم فورياً بعمل Invalidation للـ Feed لإظهار المنشور في الصدارة دون الحاجة لإعادة تحميل التطبيق بالكامل.

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postsApi, CreatePostPayload } from '@/api/endpoints/posts.api';
import { queryKeys } from '@/api/query-keys';

export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreatePostPayload) => postsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feed.infinite() });
    },
  });
}
```

---

### 4.4 هوك الإبلاغ عن منشور مخالف (`src/hooks/useReportPost.ts`)
* ينفذ `POST /posts/:id/report`.
* يعالج بدقة أكواد `403 CANNOT_REPORT_OWN_POST` و `409 ALREADY_REPORTED` و `429 TOO_MANY_REQUESTS`.

```typescript
import { useMutation } from '@tanstack/react-query';
import { reportsApi, ReportReason } from '@/api/endpoints/reports.api';

interface ReportParams {
  postId: string;
  reason: ReportReason;
}

export function useReportPost() {
  return useMutation({
    mutationFn: ({ postId, reason }: ReportParams) =>
      reportsApi.report(postId, reason),
  });
}
```

---

## 5. ميثاق معالجة الأخطاء والرسائل الموجهة للمستخدم (UI Toast Messages)

كل استجابة خطأ تُحول عبر محول نصوص مركزي (`src/api/utils/error-messages.ts`):

```typescript
export const ERROR_MESSAGES_AR: Record<string, string> = {
  VALIDATION_ERROR: 'يرجى التأكد من صحة البيانات المدخلة ومطابقتها للشروط.',
  EMPTY_POST: 'لا يمكن نشر منشور فارغ بدون نص وبدون وسائط.',
  INVALID_MEDIA_COMBINATION: 'يمكنك اختيار حتى 4 صور أو فيديو واحد فقط، ولا يمكن الجمع بينهما.',
  UNAUTHENTICATED: 'انتهت جلستك، يرجى تسجيل الدخول مجدداً.',
  ACCOUNT_SUSPENDED: 'تم تعليق هذا الحساب بسبب بلاغات متكررة عن مخالفة معايير المنصة.',
  CANNOT_REPORT_OWN_POST: 'لا يمكنك الإبلاغ عن منشورك الخاص.',
  ALREADY_REPORTED: 'لقد قمت بالإبلاغ عن هذا المنشور مسبقاً، والبلاغ قيد المراجعة.',
  POST_NOT_FOUND: 'هذا المنشور غير متاح حالياً (قد يكون محذوفاً أو تم إخفاؤه).',
  POST_NOT_EDITABLE: 'لا يمكن تعديل هذا المنشور.',
  PAYLOAD_TOO_LARGE: 'حجم المحتوى المرسل كبير جداً وتجاوز الحد المسموح.',
  TOO_MANY_REQUESTS: 'تم إرسال عدد كبير من الطلبات في وقت قصير، يرجى الانتظار دقيقة والمحاولة ثانية.',
  NETWORK_ERROR: 'تعذر الاتصال بالخادم، يرجى التحقق من اتصالك بالإنترنت.',
};
```
