import { describe, it, expect } from 'vitest';
import { MediaUrlService } from '../../media/media-url.service';
import { toUserMeDto, toUserPublicDto } from '../user.mapper';

const mediaUrl = new MediaUrlService({ getOrThrow: () => 'https://media.test.local' } as any);

// A row carrying every sensitive column, to prove none of them can leak.
const row = {
  id: '5b0c1c1e-7a52-4c61-9d6f-0f4d6d3f1a11',
  firebaseUid: 'SECRET-UID',
  displayName: 'Ahmed',
  bio: 'Backend dev',
  avatarKey: 'media/u/a.jpg',
  status: 'ACTIVE' as const,
  reportCount: 9,
  createdAt: new Date('2026-10-21T10:00:00.000Z'),
  updatedAt: new Date('2026-10-22T10:00:00.000Z'),
};

describe('user mappers', () => {
  it('toUserPublicDto exposes exactly the public keys', () => {
    const dto = toUserPublicDto(row, mediaUrl);
    expect(Object.keys(dto)).toEqual(['id', 'displayName', 'bio', 'avatarUrl', 'createdAt']);
    expect(dto.avatarUrl).toBe('https://media.test.local/media/u/a.jpg');
    expect(dto.createdAt).toBe('2026-10-21T10:00:00.000Z');
  });

  it('toUserMeDto adds status and nothing else', () => {
    const dto = toUserMeDto(row, mediaUrl);
    expect(Object.keys(dto)).toEqual(['id', 'displayName', 'bio', 'avatarUrl', 'createdAt', 'status']);
    expect(dto.status).toBe('ACTIVE');
  });

  it('never leaks firebaseUid / reportCount / updatedAt', () => {
    const json = JSON.stringify(toUserMeDto(row, mediaUrl));
    expect(json).not.toContain('SECRET-UID');
    expect(json).not.toContain('firebaseUid');
    expect(json).not.toContain('reportCount');
    expect(json).not.toContain('updatedAt');
  });

  it('avatarUrl is null when there is no avatarKey', () => {
    expect(toUserPublicDto({ ...row, avatarKey: null }, mediaUrl).avatarUrl).toBeNull();
  });

  it('toUserMeDto refuses a non-ACTIVE user (invariant)', () => {
    expect(() => toUserMeDto({ ...row, status: 'SUSPENDED' }, mediaUrl)).toThrow();
  });
});
