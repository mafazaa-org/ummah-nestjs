import { User } from '@prisma/client';
import { MediaUrlService } from '../media/media-url.service';

export interface UserPublicDto {
  id: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface UserMeDto extends UserPublicDto {
  status: 'ACTIVE';
}

type UserRow = Pick<User, 'id' | 'displayName' | 'bio' | 'avatarKey' | 'createdAt' | 'status'>;

/**
 * The ONLY place user responses are shaped. Fields are copied explicitly (never spread),
 * so firebaseUid / reportCount / updatedAt can never leak (BRD §4.0 display rules).
 */
export function toUserPublicDto(user: UserRow, mediaUrl: MediaUrlService): UserPublicDto {
  return {
    id: user.id,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: mediaUrl.build(user.avatarKey),
    createdAt: user.createdAt.toISOString(),
  };
}

export function toUserMeDto(user: UserRow, mediaUrl: MediaUrlService): UserMeDto {
  if (user.status !== 'ACTIVE') {
    // Suspended users are rejected by AuthGuard and can never reach a "me" response.
    throw new Error('toUserMeDto invariant violated: user is not ACTIVE');
  }
  return { ...toUserPublicDto(user, mediaUrl), status: 'ACTIVE' };
}
