import { describe, expect, it } from 'vitest';
import { afterCursorWhere, decodeCursor, encodeCursor } from '../cursor';
import { AppException } from '../../exceptions/app.exception';

describe('cursor.ts (Keyset Pagination Primitives)', () => {
  const validId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const validDate = new Date('2026-10-25T12:00:00.123Z');

  it('encodes and decodes a valid cursor preserving millisecond precision', () => {
    const encoded = encodeCursor({ createdAt: validDate, id: validId });
    expect(typeof encoded).toBe('string');

    const decoded = decodeCursor(encoded);
    expect(decoded.id).toBe(validId);
    expect(decoded.createdAt.toISOString()).toBe('2026-10-25T12:00:00.123Z');
    expect(decoded.createdAt.getTime()).toBe(validDate.getTime());
  });

  it('throws 400 INVALID_CURSOR on non-base64 / non-JSON string', () => {
    expect(() => decodeCursor('not_base64_or_json')).toThrowError(AppException);
    try {
      decodeCursor('not_base64_or_json');
    } catch (e: any) {
      expect(e.getStatus()).toBe(400);
      expect(e.code).toBe('INVALID_CURSOR');
    }
  });

  it('throws 400 INVALID_CURSOR when JSON is not an object or is null', () => {
    const nullCursor = Buffer.from('null').toString('base64url');
    expect(() => decodeCursor(nullCursor)).toThrowError(AppException);

    const arrayCursor = Buffer.from('[1, 2, 3]').toString('base64url');
    expect(() => decodeCursor(arrayCursor)).toThrowError(AppException);

    const stringCursor = Buffer.from('"hello"').toString('base64url');
    expect(() => decodeCursor(stringCursor)).toThrowError(AppException);
  });

  it('throws 400 INVALID_CURSOR when id is missing or not a valid UUID', () => {
    const noId = Buffer.from(JSON.stringify({ c: validDate.toISOString() })).toString('base64url');
    expect(() => decodeCursor(noId)).toThrowError(AppException);

    const invalidUuid = Buffer.from(JSON.stringify({ c: validDate.toISOString(), i: 'not-a-uuid' })).toString('base64url');
    expect(() => decodeCursor(invalidUuid)).toThrowError(AppException);
  });

  it('throws 400 INVALID_CURSOR when date is missing or not canonical ISO', () => {
    const noDate = Buffer.from(JSON.stringify({ i: validId })).toString('base64url');
    expect(() => decodeCursor(noDate)).toThrowError(AppException);

    const nonCanonicalDate = Buffer.from(JSON.stringify({ c: '2026-02-31T00:00:00.000Z', i: validId })).toString('base64url');
    expect(() => decodeCursor(nonCanonicalDate)).toThrowError(AppException);

    const garbageDate = Buffer.from(JSON.stringify({ c: 'invalid-date', i: validId })).toString('base64url');
    expect(() => decodeCursor(garbageDate)).toThrowError(AppException);
  });

  it('afterCursorWhere builds the correct OR keyset filter', () => {
    const filter = afterCursorWhere({ createdAt: validDate, id: validId });
    expect(filter).toEqual({
      OR: [
        { createdAt: { lt: validDate } },
        { createdAt: validDate, id: { lt: validId } },
      ],
    });
  });
});
