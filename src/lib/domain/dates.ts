/**
 * Canonical date handling.
 *
 * INVARIANT: every persisted date (`Expense.date`, `JournalEntry.date`,
 * `CsvJournalEntry.date`, `PendingImportItem.date`) is a Gregorian ISO
 * `YYYY-MM-DD` string that denotes a real calendar day.
 *
 * Jalali input is converted at the ingestion boundary. Display conversion
 * (Gregorian -> Jalali) stays presentation-only in `engine/calendar.ts`.
 */

/** Years in this range are unambiguously Jalali (≈ 1821..2121 Gregorian). */
export const JALALI_MIN_YEAR = 1200;
export const JALALI_MAX_YEAR = 1500;

/** Years in this range are unambiguously Gregorian. */
export const GREGORIAN_MIN_YEAR = 1700;
export const GREGORIAN_MAX_YEAR = 2200;

export type DateCalendar = 'gregorian' | 'jalali';

export type DateFailureReason =
  | 'empty'
  | 'unparseable'
  | 'impossible'
  | 'ambiguous_calendar'
  | 'year_out_of_range';

export type CanonicalDateResult =
  | { ok: true; date: string; sourceCalendar: DateCalendar; converted: boolean }
  | { ok: false; reason: DateFailureReason; raw: string };

function isLeapGregorian(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function gregorianMonthLength(year: number, month: number): number {
  const lengths = [31, isLeapGregorian(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1] ?? 0;
}

/**
 * Jalali leap years follow the 33-year cycle used by the companion
 * `gregorianToJalali` implementation in engine/calendar.ts.
 */
function isLeapJalali(year: number): boolean {
  const mod = ((year + 11) % 33 + 33) % 33;
  return mod % 4 === 0 && mod !== 32;
}

export function jalaliMonthLength(year: number, month: number): number {
  if (month < 1 || month > 12) return 0;
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isLeapJalali(year) ? 30 : 29;
}

function isInteger(n: number): boolean {
  return Number.isInteger(n);
}

export function isValidGregorianYMD(year: number, month: number, day: number): boolean {
  if (!isInteger(year) || !isInteger(month) || !isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  return day <= gregorianMonthLength(year, month);
}

export function isValidJalaliYMD(year: number, month: number, day: number): boolean {
  if (!isInteger(year) || !isInteger(month) || !isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  return day <= jalaliMonthLength(year, month);
}

/**
 * Inverse of `gregorianToJalali` (engine/calendar.ts). Same 33-year-cycle family,
 * so `gregorianToJalali(jalaliToGregorian(y, m, d)) === [y, m, d]`.
 */
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  const jy1 = jy + 1595;
  let days =
    -355668 +
    365 * jy1 +
    Math.floor(jy1 / 33) * 8 +
    Math.floor(((jy1 % 33) + 3) / 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);

  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;

  if (days > 36524) {
    days--;
    gy += 100 * Math.floor(days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }

  gy += 4 * Math.floor(days / 1461);
  days %= 1461;

  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  let gd = days + 1;
  const monthLengths = [31, isLeapGregorian(gy) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  while (gm < 12 && gd > monthLengths[gm]) {
    gd -= monthLengths[gm];
    gm++;
  }
  return [gy, gm + 1, gd];
}

export function formatISO(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Classifies a year number into a calendar domain. Returns null when the year
 * cannot be attributed with confidence — callers must not guess.
 */
export function detectCalendarForYear(year: number): DateCalendar | null {
  if (year >= JALALI_MIN_YEAR && year <= JALALI_MAX_YEAR) return 'jalali';
  if (year >= GREGORIAN_MIN_YEAR && year <= GREGORIAN_MAX_YEAR) return 'gregorian';
  return null;
}

export interface CanonicalizeOptions {
  /**
   * Explicit calendar of the source data. When omitted the year range decides.
   * Never inferred from formatting alone.
   */
  sourceCalendar?: DateCalendar;
}

/**
 * Converts an already-split (year, month, day) triple into a canonical
 * Gregorian ISO date, validating that the day exists in its own calendar.
 */
export function canonicalizeYMD(
  year: number,
  month: number,
  day: number,
  options: CanonicalizeOptions = {}
): CanonicalDateResult {
  const raw = `${year}-${month}-${day}`;
  if (!isInteger(year) || !isInteger(month) || !isInteger(day)) {
    return { ok: false, reason: 'unparseable', raw };
  }

  const calendar = options.sourceCalendar ?? detectCalendarForYear(year);
  if (!calendar) {
    // A year outside both known ranges is not something we may silently accept.
    return { ok: false, reason: 'year_out_of_range', raw };
  }

  if (calendar === 'jalali') {
    if (!isValidJalaliYMD(year, month, day)) {
      return { ok: false, reason: 'impossible', raw };
    }
    const [gy, gm, gd] = jalaliToGregorian(year, month, day);
    return { ok: true, date: formatISO(gy, gm, gd), sourceCalendar: 'jalali', converted: true };
  }

  if (!isValidGregorianYMD(year, month, day)) {
    return { ok: false, reason: 'impossible', raw };
  }
  return { ok: true, date: formatISO(year, month, day), sourceCalendar: 'gregorian', converted: false };
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Normalizes Persian/Arabic-Indic digits to ASCII. */
export function normalizeDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const pi = PERSIAN_DIGITS.indexOf(ch);
    if (pi >= 0) { out += String(pi); continue; }
    const ai = ARABIC_DIGITS.indexOf(ch);
    if (ai >= 0) { out += String(ai); continue; }
    out += ch;
  }
  return out;
}

export type DayFirstPreference = 'auto' | 'mdy' | 'dmy';

export interface ParseDateOptions extends CanonicalizeOptions {
  /** Disambiguates numeric d/m/y ordering when both values are <= 12. */
  order?: DayFirstPreference;
}

/**
 * Parses a raw date string from untrusted input (CSV cell, QR payload, AI
 * output) into a canonical Gregorian ISO date.
 *
 * Never falls back to `new Date(...)`: that path silently applied the host
 * timezone and produced off-by-one days.
 */
export function parseCanonicalDate(raw: string, options: ParseDateOptions = {}): CanonicalDateResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty', raw: String(raw ?? '') };
  const cleaned = normalizeDigits(raw).trim();
  if (!cleaned) return { ok: false, reason: 'empty', raw };

  // Drop a trailing time component ("2024-01-02 13:45", "2024-01-02T13:45:00").
  const datePart = cleaned.split(/[\sT]/)[0];

  const separatorMatch = datePart.match(/^(\d{1,4})([/\-.])(\d{1,2})\2(\d{1,4})$/);
  if (separatorMatch) {
    const a = Number(separatorMatch[1]);
    const b = Number(separatorMatch[3]);
    const c = Number(separatorMatch[4]);
    return resolveNumericTriple(a, b, c, raw, options);
  }

  // Month-name forms are locale-specific and were previously mis-parsed via
  // Date(); surface them rather than guessing.
  return { ok: false, reason: 'unparseable', raw };
}

function resolveNumericTriple(
  a: number,
  b: number,
  c: number,
  raw: string,
  options: ParseDateOptions
): CanonicalDateResult {
  const order = options.order ?? 'auto';

  // Year-first: the only unambiguous ordering.
  if (a > 31) {
    return canonicalizeYMD(a, b, c, options);
  }

  // Year-last.
  if (c > 31) {
    if (order === 'dmy') return canonicalizeYMD(c, b, a, options);
    if (order === 'mdy') return canonicalizeYMD(c, a, b, options);
    if (a > 12 && b <= 12) return canonicalizeYMD(c, b, a, options); // day-month-year
    if (b > 12 && a <= 12) return canonicalizeYMD(c, a, b, options); // month-day-year
    if (a <= 12 && b <= 12) {
      // Genuinely ambiguous (e.g. 03/04/2025). Do not guess.
      return { ok: false, reason: 'ambiguous_calendar', raw };
    }
    return { ok: false, reason: 'impossible', raw };
  }

  // Two-digit years cannot be attributed to a calendar domain safely.
  return { ok: false, reason: 'ambiguous_calendar', raw };
}

/**
 * Infers day/month ordering from a whole column of raw dates.
 *
 * This is real disambiguation rather than a guess: a value with a first
 * component > 12 can only be day-first, and one with a second component > 12
 * can only be month-first. Returns 'auto' when the column contains no
 * discriminating row, in which case individual ambiguous values are reported
 * as such instead of being interpreted.
 */
export function inferDateOrder(rawDates: string[]): DayFirstPreference {
  let dmyEvidence = 0;
  let mdyEvidence = 0;

  for (const raw of rawDates) {
    if (typeof raw !== 'string') continue;
    const cleaned = normalizeDigits(raw).trim().split(/[\sT]/)[0];
    const match = cleaned.match(/^(\d{1,4})([/\-.])(\d{1,2})\2(\d{1,4})$/);
    if (!match) continue;

    const a = Number(match[1]);
    const b = Number(match[3]);
    const c = Number(match[4]);

    // Only year-last forms are ordering-ambiguous.
    if (a > 31 || c <= 31) continue;
    if (a > 12 && b <= 12) dmyEvidence++;
    else if (b > 12 && a <= 12) mdyEvidence++;
  }

  if (dmyEvidence > 0 && mdyEvidence === 0) return 'dmy';
  if (mdyEvidence > 0 && dmyEvidence === 0) return 'mdy';
  return 'auto';
}

/**
 * True when a stored string is already a canonical Gregorian ISO date.
 * Used by the persistence migration to leave good data untouched.
 */
export function isCanonicalDate(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (detectCalendarForYear(y) !== 'gregorian') return false;
  return isValidGregorianYMD(y, m, d);
}

/**
 * Migrates a persisted date that may predate the canonical-storage invariant.
 *
 * Only converts when the year is unambiguously Jalali; anything else is left
 * byte-identical so no historical value is silently rewritten.
 */
export function migrateStoredDate(value: string): { date: string; migrated: boolean } {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { date: value, migrated: false };
  }
  const [y, m, d] = value.split('-').map(Number);
  if (detectCalendarForYear(y) !== 'jalali') {
    return { date: value, migrated: false };
  }
  if (!isValidJalaliYMD(y, m, d)) {
    return { date: value, migrated: false };
  }
  const [gy, gm, gd] = jalaliToGregorian(y, m, d);
  return { date: formatISO(gy, gm, gd), migrated: true };
}
