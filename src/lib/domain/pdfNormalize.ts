// Numeric / text normalization helpers for the PDF source-data import pipeline.
// Freshour Master Prompt v2, Sections 2 and 32.
// These are deliberately conservative: anything ambiguous returns null rather
// than a guessed value, so the caller can route the row to NEEDS_SOURCE_REVIEW.

/** Collapse repeated whitespace and trim — never alters characters/meaning. */
export function cleanCanonicalName(sourceName: string): string {
  return sourceName.replace(/\s+/g, ' ').trim();
}

/**
 * Parses a Thai-Buddhist-year short date range like "01-07/10/69" into a
 * Gregorian [start, end] ISO pair, given the already-known Gregorian year.
 * Returns null if the text doesn't match the expected pattern — callers must
 * not guess a period from a malformed string.
 */
export function parseThaiShortDateRange(
  text: string,
  gregorianYear: number,
): { start: string; end: string } | null {
  const match = /^(\d{1,2})-(\d{1,2})\/(\d{1,2})\/\d{2,4}$/.exec(text.trim());
  if (!match) return null;
  const [, dayStartStr, dayEndStr, monthStr] = match;
  const dayStart = Number(dayStartStr);
  const dayEnd = Number(dayEndStr);
  const month = Number(monthStr);
  if (!dayStart || !dayEnd || !month || month < 1 || month > 12) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start: `${gregorianYear}-${pad(month)}-${pad(dayStart)}`,
    end: `${gregorianYear}-${pad(month)}-${pad(dayEnd)}`,
  };
}

/**
 * Normalizes a numeric cell. Accepts plain numbers and strings with thousands
 * separators. Returns null for blank/dash placeholders. Throws for anything
 * else — callers should catch and route to NEEDS_SOURCE_REVIEW rather than
 * silently coercing garbage to 0.
 */
export function normalizeNumericCell(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '–') return null;
  const cleaned = trimmed.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new Error(`Unrecognized numeric cell: "${raw}"`);
  }
  return Number(cleaned);
}
