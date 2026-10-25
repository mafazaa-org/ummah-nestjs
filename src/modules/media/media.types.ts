import { MediaType } from '@prisma/client';

export interface PresignResponse {
  uploadUrl: string;
  key: string;
  method: 'PUT';
  headers: {
    'Content-Type': string;
  };
  expiresAt: string;
}

export { VerifiedMedia } from '../../common/media/media-key-verifier';
