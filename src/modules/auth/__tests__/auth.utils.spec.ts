import { describe, it, expect } from 'vitest';
import { deriveDisplayName, extractBearer } from '../auth.utils';

describe('extractBearer', () => {
  it('extracts the token from a Bearer header', () => {
    expect(extractBearer('Bearer abc.def')).toBe('abc.def');
  });

  it('is case-insensitive on the scheme', () => {
    expect(extractBearer('bearer abc')).toBe('abc');
  });

  it.each([undefined, '', 'Bearer', 'Bearer ', 'Bearer    ', 'Basic abc', 'abc'])(
    'returns null for %j',
    (header) => {
      expect(extractBearer(header as string | undefined)).toBeNull();
    },
  );
});

describe('deriveDisplayName', () => {
  it('prefers the trimmed name', () => {
    expect(deriveDisplayName({ name: '  Zaid  ', email: 'z@x.com' })).toBe('Zaid');
  });

  it('falls back to the email local-part', () => {
    expect(deriveDisplayName({ email: 'ahmed.ali@example.com' })).toBe('ahmed.ali');
    expect(deriveDisplayName({ name: '   ', email: 'ahmed@example.com' })).toBe('ahmed');
  });

  it("falls back to 'User' when nothing usable exists", () => {
    expect(deriveDisplayName({})).toBe('User');
    expect(deriveDisplayName({ name: '   ', email: '@example.com' })).toBe('User');
  });

  it('truncates to 50 characters', () => {
    expect(deriveDisplayName({ name: 'a'.repeat(80) })).toHaveLength(50);
    expect(deriveDisplayName({ email: `${'b'.repeat(80)}@x.com` })).toHaveLength(50);
  });

  it('never splits an emoji when truncating', () => {
    const name = deriveDisplayName({ name: '🌙'.repeat(60) });
    expect(Array.from(name)).toHaveLength(50);
    expect(name).toBe('🌙'.repeat(50));
  });

  it('strips NUL/control characters (Postgres rejects NUL)', () => {
    expect(deriveDisplayName({ name: 'Za\u0000id' })).toBe('Zaid');
  });
});
