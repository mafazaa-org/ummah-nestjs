import { Cursor, encodeCursor } from './cursor';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Rows must be fetched with `take: limit + 1`; the extra row only signals that another page exists. */
export function buildPage<R extends Cursor, T>(rows: R[], limit: number, map: (row: R) => T): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return { items: items.map(map), nextCursor: hasMore && last ? encodeCursor(last) : null };
}
