import { sanitizeText } from '../../common/utils/sanitizer.util';
import { FirebaseDecodedToken } from './firebase.types';

const DISPLAY_NAME_MAX = 50;

/** `Authorization: Bearer <token>` → token, or null when absent/malformed/empty. */
export function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1].trim();
  return token ? token : null;
}

/** Cuts by code points (not UTF-16 units) so emoji/surrogate pairs are never split. */
function clip(value: string, max: number): string {
  return Array.from(value).slice(0, max).join('').trim();
}

/**
 * BRD §2.4: decoded.name (trimmed, max 50) || local-part of decoded.email (max 50) || 'User'.
 * Values are sanitized first: a NUL byte would make Postgres reject the INSERT (-> 500).
 */
export function deriveDisplayName(decoded: Pick<FirebaseDecodedToken, 'name' | 'email'>): string {
  const fromName = clip(sanitizeText(decoded.name ?? ''), DISPLAY_NAME_MAX);
  if (fromName) return fromName;

  const fromEmail = clip(sanitizeText(decoded.email?.split('@')[0] ?? ''), DISPLAY_NAME_MAX);
  return fromEmail || 'User';
}
