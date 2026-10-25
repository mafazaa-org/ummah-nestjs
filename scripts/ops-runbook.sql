-- ============================================================================
-- Ummah Backend V1 — Operations & Manual Runbook SQL Queries
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Review Queue: List Hidden Posts with Aggregated Reasons
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 2. Review Queue: List Suspended Users
-- ----------------------------------------------------------------------------
SELECT id, "displayName", "reportCount", "updatedAt" 
FROM users 
WHERE status = 'SUSPENDED' 
ORDER BY "updatedAt" DESC;

-- ----------------------------------------------------------------------------
-- 3. Procedure: Reinstate Hidden Post (Atomic with Author Counter Compensation)
-- Usage in psql: \set post_id 'YOUR-POST-UUID'
-- ----------------------------------------------------------------------------
-- BEGIN;
-- WITH p AS (
--   SELECT id, "authorId", "reportCount" 
--   FROM posts
--   WHERE id = :'post_id' AND status = 'HIDDEN' 
--   FOR UPDATE
-- ), u AS (
--   UPDATE users 
--   SET "reportCount" = GREATEST(0, users."reportCount" - p."reportCount"), 
--       "updatedAt" = now()
--   FROM p 
--   WHERE users.id = p."authorId"
--   RETURNING users.id
-- )
-- UPDATE posts 
-- SET status = 'ACTIVE', 
--     "reportCount" = 0, 
--     "updatedAt" = now()
-- WHERE id IN (SELECT id FROM p)
-- RETURNING id, status, "reportCount";
-- COMMIT;

-- ----------------------------------------------------------------------------
-- 4. Procedure: Un-suspend User Account
-- Usage in psql: \set user_id 'YOUR-USER-UUID'
-- ----------------------------------------------------------------------------
-- UPDATE users 
-- SET status = 'ACTIVE', 
--     "reportCount" = 0, 
--     "updatedAt" = now()
-- WHERE id = :'user_id' AND status = 'SUSPENDED'
-- RETURNING id, "displayName", status, "reportCount";

-- ----------------------------------------------------------------------------
-- 5. Procedure: Permanent Hard Delete
-- Usage in psql: \set post_id 'YOUR-POST-UUID'
-- ----------------------------------------------------------------------------
-- BEGIN;
-- SELECT key FROM post_media WHERE "postId" = :'post_id';
-- DELETE FROM posts WHERE id = :'post_id' RETURNING id;
-- COMMIT;
