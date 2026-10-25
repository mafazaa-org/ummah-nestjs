-- DropIndex
DROP INDEX "posts_authorId_createdAt_idx";

-- CreateIndex
CREATE INDEX "posts_authorId_createdAt_id_idx" ON "posts"("authorId", "createdAt" DESC, "id" DESC);
