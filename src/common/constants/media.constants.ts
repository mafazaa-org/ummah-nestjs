import { MediaType } from '@prisma/client';

/** BRD §4.0: media/{userId}/{uuid}.{ext} */
export const MEDIA_KEY_REGEX = /^media\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov)$/;

export const IMAGE_CT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export const VIDEO_CT = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
} as const;

export type ImageContentType = keyof typeof IMAGE_CT;
export type VideoContentType = keyof typeof VIDEO_CT;
export type AllowedContentType = ImageContentType | VideoContentType;

export const ALLOWED_IMAGE_TYPES = Object.keys(IMAGE_CT) as ImageContentType[];
export const ALLOWED_VIDEO_TYPES = Object.keys(VIDEO_CT) as VideoContentType[];
export const ALL_ALLOWED_CONTENT_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

export interface ClassifiedMedia {
  type: MediaType;
  expectedExt: string;
}

/**
 * Safely classify a Content-Type without falling into prototype property traps (e.g. 'toString', 'constructor')
 */
export function classifyContentType(contentType: string): ClassifiedMedia | null {
  if (typeof contentType !== 'string') return null;
  const ct = contentType.toLowerCase().trim();

  if (Object.hasOwn(IMAGE_CT, ct)) {
    return {
      type: 'IMAGE',
      expectedExt: IMAGE_CT[ct as ImageContentType],
    };
  }

  if (Object.hasOwn(VIDEO_CT, ct)) {
    return {
      type: 'VIDEO',
      expectedExt: VIDEO_CT[ct as VideoContentType],
    };
  }

  return null;
}
