import { S3Client, ListObjectsV2Command, DeleteObjectCommand, _Object } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';

export interface StorageObjectSummary {
  key: string;
  lastModifiedMs: number;
}

/**
 * Pure decision function: selects orphan keys eligible for deletion.
 * - Keys must not be in usedKeys set.
 * - Keys must be older than minAgeMs (default 24h) to avoid deleting in-flight uploads.
 */
export function selectOrphans(
  objects: StorageObjectSummary[],
  usedKeys: Set<string>,
  nowMs: number,
  minAgeMs = 24 * 60 * 60 * 1000,
): string[] {
  return objects
    .filter((obj) => {
      const age = nowMs - obj.lastModifiedMs;
      return age > minAgeMs && !usedKeys.has(obj.key);
    })
    .map((obj) => obj.key);
}

/**
 * Runner function for BRD §7.4-b
 */
export async function runOrphanCleanup(options?: {
  s3Client?: S3Client;
  prismaClient?: PrismaClient;
  dryRun?: boolean;
}) {
  const dryRun = options?.dryRun ?? (process.env.DRY_RUN !== 'false');
  const prisma = options?.prismaClient ?? new PrismaClient();
  const bucket = process.env.S3_BUCKET!;
  const s3 =
    options?.s3Client ??
    new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || 'auto',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });

  const used = new Set<string>([
    ...(await prisma.postMedia.findMany({ select: { key: true } })).map((m) => m.key),
    ...(await prisma.user.findMany({ where: { avatarKey: { not: null } }, select: { avatarKey: true } })).map(
      (u) => u.avatarKey!,
    ),
  ]);

  let token: string | undefined;
  let totalDeleted = 0;
  const now = Date.now();

  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'media/',
        ContinuationToken: token,
      }),
    );

    const summaries: StorageObjectSummary[] = (page.Contents ?? [])
      .filter((obj): obj is _Object & { Key: string } => typeof obj.Key === 'string')
      .map((obj) => ({
        key: obj.Key,
        lastModifiedMs: obj.LastModified?.getTime() ?? now,
      }));

    const orphans = selectOrphans(summaries, used, now);

    for (const key of orphans) {
      if (dryRun) {
        console.log(`[dry-run] would delete orphan: ${key}`);
      } else {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        console.log(`deleted orphan: ${key}`);
      }
      totalDeleted++;
    }

    token = page.NextContinuationToken;
  } while (token);

  console.log(`Orphan cleanup complete. ${dryRun ? 'Identified' : 'Deleted'} ${totalDeleted} files.`);
  return { totalDeleted, dryRun };
}

// Direct CLI execution
if (process.argv[1]?.includes('cleanup-orphan-media')) {
  runOrphanCleanup().catch((err) => {
    console.error('Cleanup failed:', err);
    process.exit(1);
  });
}
