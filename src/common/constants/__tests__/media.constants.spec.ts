import { describe, it, expect } from 'vitest';
import { classifyContentType } from '../media.constants';

describe('classifyContentType', () => {
  it('classifies allowed image content types correctly', () => {
    expect(classifyContentType('image/jpeg')).toEqual({ type: 'IMAGE', expectedExt: 'jpg' });
    expect(classifyContentType('image/png')).toEqual({ type: 'IMAGE', expectedExt: 'png' });
    expect(classifyContentType('image/webp')).toEqual({ type: 'IMAGE', expectedExt: 'webp' });
  });

  it('classifies allowed video content types correctly', () => {
    expect(classifyContentType('video/mp4')).toEqual({ type: 'VIDEO', expectedExt: 'mp4' });
    expect(classifyContentType('video/quicktime')).toEqual({ type: 'VIDEO', expectedExt: 'mov' });
  });

  it('handles case-insensitivity and surrounding whitespace', () => {
    expect(classifyContentType(' IMAGE/JPEG ')).toEqual({ type: 'IMAGE', expectedExt: 'jpg' });
    expect(classifyContentType('Video/MP4')).toEqual({ type: 'VIDEO', expectedExt: 'mp4' });
  });

  it('returns null for non-whitelisted content types', () => {
    expect(classifyContentType('image/gif')).toBeNull();
    expect(classifyContentType('image/svg+xml')).toBeNull();
    expect(classifyContentType('application/pdf')).toBeNull();
    expect(classifyContentType('text/html')).toBeNull();
  });

  it('guards against prototype pollution traps (e.g. constructor, toString)', () => {
    expect(classifyContentType('constructor')).toBeNull();
    expect(classifyContentType('toString')).toBeNull();
    expect(classifyContentType('valueOf')).toBeNull();
    expect(classifyContentType('__proto__')).toBeNull();
  });
});
