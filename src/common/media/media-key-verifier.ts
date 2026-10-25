import { MediaType } from '@prisma/client';

export type MediaPurpose = 'POST' | 'AVATAR';

export const MEDIA_KEY_VERIFIER = Symbol('MEDIA_KEY_VERIFIER');

export interface VerifiedMedia {
  key: string;
  type: MediaType;
  position: number;
}

/** Port for BRD §5.1. Implemented by MediaService (S3 HEAD + combination + reuse rules). */
export interface MediaKeyVerifier {
  verifyMediaKeys(userId: string, keys: string[], purpose: MediaPurpose): Promise<VerifiedMedia[]>;
}

