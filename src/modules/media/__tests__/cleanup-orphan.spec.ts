import { describe, it, expect } from 'vitest';
import { selectOrphans, StorageObjectSummary } from '../../../../scripts/cleanup-orphan-media';

describe('selectOrphans (Cleanup Decision D2)', () => {
  const now = 1700000000000;
  const dayMs = 24 * 60 * 60 * 1000;

  it('C1 never selects keys that exist in the used set', () => {
    const used = new Set(['media/user-1/post-img.jpg', 'media/user-2/avatar.png']);

    const objects: StorageObjectSummary[] = [
      { key: 'media/user-1/post-img.jpg', lastModifiedMs: now - dayMs * 5 }, // used, old
      { key: 'media/user-2/avatar.png', lastModifiedMs: now - dayMs * 10 }, // used, old
    ];

    expect(selectOrphans(objects, used, now, dayMs)).toEqual([]);
  });

  it('C2 ignores objects modified within the last 24 hours (in-flight uploads safety)', () => {
    const used = new Set<string>();

    const objects: StorageObjectSummary[] = [
      { key: 'media/user-1/recent.jpg', lastModifiedMs: now - 1000 * 60 * 30 }, // 30 mins old
      { key: 'media/user-1/barely.jpg', lastModifiedMs: now - dayMs + 1000 }, // 23h 59m old
    ];

    expect(selectOrphans(objects, used, now, dayMs)).toEqual([]);
  });

  it('C3 selects unused keys older than 24 hours', () => {
    const used = new Set(['media/active.jpg']);

    const objects: StorageObjectSummary[] = [
      { key: 'media/active.jpg', lastModifiedMs: now - dayMs * 2 }, // used
      { key: 'media/orphan-1.jpg', lastModifiedMs: now - dayMs * 2 }, // orphan
      { key: 'media/orphan-2.jpg', lastModifiedMs: now - dayMs * 5 }, // orphan
      { key: 'media/fresh.jpg', lastModifiedMs: now - 5000 }, // fresh unused
    ];

    expect(selectOrphans(objects, used, now, dayMs)).toEqual([
      'media/orphan-1.jpg',
      'media/orphan-2.jpg',
    ]);
  });
});
