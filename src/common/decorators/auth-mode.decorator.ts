import { SetMetadata } from '@nestjs/common';

export const AUTH_MODE_KEY = 'authMode';

/** PUBLIC: token ignored · OPTIONAL: token verified only if present · MANDATORY (default). */
export type AuthMode = 'PUBLIC' | 'OPTIONAL' | 'MANDATORY';

export const Public = () => SetMetadata(AUTH_MODE_KEY, 'PUBLIC' satisfies AuthMode);
export const OptionalAuth = () => SetMetadata(AUTH_MODE_KEY, 'OPTIONAL' satisfies AuthMode);
