import { HttpStatus } from '@nestjs/common';
import { AppException } from '../exceptions/app.exception';

export interface Cursor {
  createdAt: Date;
  id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalidCursor = () => new AppException(HttpStatus.BAD_REQUEST, 'INVALID_CURSOR', 'Invalid cursor');

export function encodeCursor({ createdAt, id }: Cursor): string {
  return Buffer.from(JSON.stringify({ c: createdAt.toISOString(), i: id })).toString('base64url');
}

export function decodeCursor(raw: string): Cursor {
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  if (typeof payload !== 'object' || payload === null) throw invalidCursor();

  const { c, i } = payload as Record<string, unknown>;
  if (typeof c !== 'string' || typeof i !== 'string' || !UUID_RE.test(i)) throw invalidCursor();

  const createdAt = new Date(c);
  // Round-trip check rejects non-canonical dates ("2026-13-45", "1") while keeping ms precision (TIMESTAMPTZ(3)).
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== c) throw invalidCursor();

  return { createdAt, id: i };
}

/** Keyset predicate for ORDER BY createdAt DESC, id DESC. Works for any model with (createdAt, id). */
export function afterCursorWhere({ createdAt, id }: Cursor) {
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
}
