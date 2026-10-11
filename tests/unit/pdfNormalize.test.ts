import { describe, expect, it } from 'vitest';
import { cleanCanonicalName, normalizeNumericCell, parseThaiShortDateRange } from '@/lib/domain/pdfNormalize';

describe('cleanCanonicalName', () => {
  it('collapses repeated whitespace and trims, without altering characters', () => {
    expect(cleanCanonicalName('  หมูเนื้อแดง   เบอร์1  ')).toBe('หมูเนื้อแดง เบอร์1');
  });
});

describe('parseThaiShortDateRange', () => {
  it('parses a short Thai-year range into Gregorian ISO dates', () => {
    expect(parseThaiShortDateRange('01-07/10/69', 2026)).toEqual({
      start: '2026-10-01',
      end: '2026-10-07',
    });
  });

  it('returns null for malformed text instead of guessing', () => {
    expect(parseThaiShortDateRange('not-a-date', 2026)).toBeNull();
    expect(parseThaiShortDateRange('01-07', 2026)).toBeNull();
  });
});

describe('normalizeNumericCell', () => {
  it('passes through finite numbers', () => {
    expect(normalizeNumericCell(104)).toBe(104);
  });

  it('parses numeric strings and strips thousands separators', () => {
    expect(normalizeNumericCell('1,234')).toBe(1234);
  });

  it('treats blank and dash placeholders as null, not zero', () => {
    expect(normalizeNumericCell('')).toBeNull();
    expect(normalizeNumericCell('-')).toBeNull();
    expect(normalizeNumericCell(null)).toBeNull();
    expect(normalizeNumericCell(undefined)).toBeNull();
  });

  it('throws on unrecognized text rather than silently coercing to 0', () => {
    expect(() => normalizeNumericCell('หมู')).toThrow();
  });
});
