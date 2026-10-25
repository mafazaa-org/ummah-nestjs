import { describe, expect, it } from 'vitest';
import { MediaUrlService } from '../../media/media-url.service';
import { toPostDto, PostWithRelations } from '../post.mapper';

describe('post.mapper.ts (toPostDto)', () => {
  const fakeConfig = {
    getOrThrow: (key: string) => {
      if (key === 'MEDIA_PUBLIC_BASE_URL') return 'https://cdn.example.com';
      throw new Error(`Unexpected key ${key}`);
    },
  } as any;
  const mediaUrl = new MediaUrlService(fakeConfig);

  const basePost: PostWithRelations = {
    id: 'post-1',
    authorId: 'author-1',
    text: 'Hello Ummah',
    status: 'ACTIVE',
    reportCount: 5,
    createdAt: new Date('2026-10-25T10:00:00.000Z'),
    updatedAt: new Date('2026-10-25T11:00:00.000Z'),
    author: {
      id: 'author-1',
      displayName: 'Ali',
      avatarKey: 'media/author-1/avatar.jpg',
    },
    media: [
      { key: 'media/author-1/img1.jpg', type: 'IMAGE', position: 0 },
      { key: 'media/author-1/img2.jpg', type: 'IMAGE', position: 1 },
    ],
  };

  it('correctly maps active post and transforms URLs', () => {
    const dto = toPostDto(basePost, mediaUrl);

    expect(dto).toEqual({
      id: 'post-1',
      text: 'Hello Ummah',
      status: 'ACTIVE',
      createdAt: '2026-10-25T10:00:00.000Z',
      author: {
        id: 'author-1',
        displayName: 'Ali',
        avatarUrl: 'https://cdn.example.com/media/author-1/avatar.jpg',
      },
      media: [
        { url: 'https://cdn.example.com/media/author-1/img1.jpg', type: 'IMAGE', position: 0 },
        { url: 'https://cdn.example.com/media/author-1/img2.jpg', type: 'IMAGE', position: 1 },
      ],
    });
  });

  it('guarantees sensitive fields (reportCount, updatedAt, raw keys, authorId) never leak', () => {
    const dto: any = toPostDto(basePost, mediaUrl);

    expect(dto.reportCount).toBeUndefined();
    expect(dto.updatedAt).toBeUndefined();
    expect(dto.authorId).toBeUndefined();
    expect(dto.author.avatarKey).toBeUndefined();
    expect(dto.media[0].key).toBeUndefined();
  });

  it('maps avatarUrl to null when author has no avatarKey', () => {
    const postWithoutAvatar: PostWithRelations = {
      ...basePost,
      author: { ...basePost.author, avatarKey: null },
    };
    const dto = toPostDto(postWithoutAvatar, mediaUrl);
    expect(dto.author.avatarUrl).toBeNull();
  });

  it('handles HIDDEN status mapping', () => {
    const hiddenPost: PostWithRelations = {
      ...basePost,
      status: 'HIDDEN',
    };
    const dto = toPostDto(hiddenPost, mediaUrl);
    expect(dto.status).toBe('HIDDEN');
  });

  it('throws an error if attempting to serialize a DELETED post (invariant check)', () => {
    const deletedPost: PostWithRelations = {
      ...basePost,
      status: 'DELETED',
    };
    expect(() => toPostDto(deletedPost, mediaUrl)).toThrowError(
      'toPostDto invariant violated: DELETED posts are never serialized',
    );
  });
});
