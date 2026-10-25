import { describe, it, expect } from 'vitest';
import { sanitizeText } from '../sanitizer.util';

describe('sanitizeText', () => {
  it('trims surrounding whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello');
  });

  it('removes NUL and control characters', () => {
    expect(sanitizeText('a\u0000b\u0007c\u001Bd\u007Fe\u0085f')).toBe('abcdef');
  });

  it('keeps newline and tab inside the text', () => {
    expect(sanitizeText('line1\nline2\tend')).toBe('line1\nline2\tend');
  });

  it('removes carriage returns (CRLF collapses to LF)', () => {
    expect(sanitizeText('a\r\nb')).toBe('a\nb');
  });

  it('collapses control-only / whitespace-only input to an empty string', () => {
    expect(sanitizeText('\u0000\u0001   \u0002')).toBe('');
    expect(sanitizeText('   ')).toBe('');
  });

  it('preserves Arabic text and emoji', () => {
    expect(sanitizeText(' مرحبا 🌙 ')).toBe('مرحبا 🌙');
  });
});
