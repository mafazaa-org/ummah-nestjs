import { describe, expect, it } from 'vitest';
import { buildPage } from '../page';
import { decodeCursor } from '../cursor';

describe('page.ts (buildPage Helper)', () => {
  const makeRow = (n: number) => ({
    id: `00000000-0000-0000-0000-00000000000${n}`,
    createdAt: new Date(`2026-10-25T12:00:0${n}.000Z`),
    val: `Item ${n}`,
  });

  it('returns items and null nextCursor when rows <= limit', () => {
    const rows = [makeRow(1), makeRow(2)];
    const page = buildPage(rows, 2, (r) => r.val);

    expect(page.items).toEqual(['Item 1', 'Item 2']);
    expect(page.nextCursor).toBeNull();
  });

  it('slices to limit and returns valid nextCursor when rows > limit (limit + 1 fetched)', () => {
    const rows = [makeRow(1), makeRow(2), makeRow(3)];
    const page = buildPage(rows, 2, (r) => r.val);

    expect(page.items).toEqual(['Item 1', 'Item 2']);
    expect(page.nextCursor).not.toBeNull();

    const decoded = decodeCursor(page.nextCursor!);
    expect(decoded.id).toBe(rows[1].id);
    expect(decoded.createdAt.toISOString()).toBe(rows[1].createdAt.toISOString());
  });

  it('handles empty rows gracefully', () => {
    const page = buildPage([], 10, (r) => r);
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});
