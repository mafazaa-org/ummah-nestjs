import { Transform } from 'class-transformer';

// NUL and control characters (C0 + DEL + C1) except \t (0x09) and \n (0x0A).
// eslint-disable-next-line no-control-regex
const DISALLOWED_CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

/**
 * BRD §7 sanitizeText: strip NUL/control characters (keeping \n and \t), then trim.
 * Stripping first means a value made only of control chars/whitespace collapses to ''.
 * Text is stored as plain text; output escaping is the client's responsibility.
 */
export function sanitizeText(value: string): string {
  return value.replace(DISALLOWED_CONTROL_CHARS, '').trim();
}

/** DTO property decorator: sanitizes strings, passes null/undefined/non-strings through for validators. */
export const SanitizeText = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? sanitizeText(value) : value));

/**
 * BRD V2 §6.2 sanitizeFileName:
 * Strip control characters, null bytes, directory traversal patterns (/ and \), and limit to 120 chars.
 */
export function sanitizeFileName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  // Strip control chars
  let cleaned = name.replace(DISALLOWED_CONTROL_CHARS, '');
  // Strip directory paths (e.g. C:\foo or ../../bar)
  cleaned = cleaned.replace(/^.*[\\/]/, '');
  // Strip leading dots to prevent hidden files
  cleaned = cleaned.replace(/^\.+/, '');
  // Trim spaces
  cleaned = cleaned.trim();
  // Cut to max 120 characters
  return cleaned.substring(0, 120);
}

export const SanitizeFileName = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? sanitizeFileName(value) : value));

