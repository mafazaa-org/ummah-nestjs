# Ummah Backend V1 — Operations & Manual Runbook (Admin Tasks)

> **Important Notice:** In V1, there is no Admin Web Dashboard by deliberate architectural design. All moderation review, reinstatement, and account suspension lifting are executed directly against the PostgreSQL database via `psql` using the verified, transaction-safe queries documented below.

---

## 0. Pre-Execution Guidelines & Invariants

1. **Safety First:**
   - Always verify and run queries on the `staging` database first.
   - Run a snapshot / dump before executing updates on production:
     ```bash
     pg_dump -U postgres -d ummah_db -Fc -f ummah_backup_$(date +%Y%m%d_%H%M%S).dump
     ```
2. **Schema Naming Conventions:**
   - Table names are `snake_case` (e.g. `posts`, `users`, `reports`, `post_media`).
   - Column names are `camelCase` and MUST be wrapped in double quotes in SQL (e.g. `"authorId"`, `"reportCount"`, `"updatedAt"`).
3. **The `updatedAt` Rule:**
   - PostgreSQL does not automatically update `updatedAt` for raw SQL queries (Prisma Client does this in code).
   - Any manual `UPDATE` query MUST include `"updatedAt" = now()`.
4. **Counter Integrity:**
   - Restoring a post MUST compensate (decrement) the author's report count by the post's report count, clamped to 0.
   - Records in the `reports` table MUST be preserved to prevent previous reporters from filing duplicate reports (D5 immunity).

---

## 1. Review Queue Queries (استعلامات المراجعة)

### 1.1 List Hidden Posts Awaiting Review
Returns all posts with `status = 'HIDDEN'`, their authors, report counts, preview text, and an aggregated array of report reasons.

```sql
SELECT 
  p.id, 
  p."authorId", 
  p."reportCount", 
  p."createdAt", 
  left(p.text, 120) AS preview,
  array_agg(r.reason ORDER BY r."createdAt") AS reasons
FROM posts p
JOIN reports r ON r."postId" = p.id
WHERE p.status = 'HIDDEN'
GROUP BY p.id
ORDER BY p."reportCount" DESC, p."createdAt" DESC;
```

### 1.2 List Suspended Accounts
Returns all accounts currently marked as `SUSPENDED`.

```sql
SELECT 
  id, 
  "displayName", 
  "reportCount", 
  "updatedAt" 
FROM users 
WHERE status = 'SUSPENDED' 
ORDER BY "updatedAt" DESC;
```

---

## 2. Reinstatement Procedures (إجراءات الاسترجاع)

### 2.1 Reinstate a Hidden Post (`HIDDEN` → `ACTIVE`)
Atomically restores a post to `ACTIVE`, resets its report count to 0, and subtracts the post's reports from the author's cumulative count.

```sql
\set post_id '00000000-0000-0000-0000-000000000000'

BEGIN;

WITH p AS (
  SELECT id, "authorId", "reportCount" 
  FROM posts
  WHERE id = :'post_id' AND status = 'HIDDEN' 
  FOR UPDATE
), u AS (
  UPDATE users 
  SET "reportCount" = GREATEST(0, users."reportCount" - p."reportCount"), 
      "updatedAt" = now()
  FROM p 
  WHERE users.id = p."authorId"
  RETURNING users.id
)
UPDATE posts 
SET status = 'ACTIVE', 
    "reportCount" = 0, 
    "updatedAt" = now()
WHERE id IN (SELECT id FROM p)
RETURNING id, status, "reportCount";

-- Verification:
-- 1 row returned = Success
-- 0 rows returned = Post not found or was not HIDDEN
COMMIT;
```

> **Note:** If the post author is still `SUSPENDED`, the post will not be visible publicly until the author's account is also un-suspended (see 2.2).

### 2.2 Un-suspend a User Account (`SUSPENDED` → `ACTIVE`)
Restores an account to `ACTIVE` and resets the cumulative report count to 0.

```sql
\set user_id '00000000-0000-0000-0000-000000000000'

UPDATE users 
SET status = 'ACTIVE', 
    "reportCount" = 0, 
    "updatedAt" = now()
WHERE id = :'user_id' AND status = 'SUSPENDED'
RETURNING id, "displayName", status, "reportCount";
```

> **Note:** Any posts of this user that were individually marked `HIDDEN` remain `HIDDEN` and must be reinstated post-by-post using Procedure 2.1.

---

## 3. Permanent Deletion & Media Cleanup (الحذف النهائي)

```sql
\set post_id '00000000-0000-0000-0000-000000000000'

BEGIN;

-- Step 1: Note media keys to clean from S3/R2 storage afterwards
SELECT key FROM post_media WHERE "postId" = :'post_id';

-- Step 2: Delete post (Cascade automatically deletes post_media and reports)
DELETE FROM posts WHERE id = :'post_id' RETURNING id;

COMMIT;
```
