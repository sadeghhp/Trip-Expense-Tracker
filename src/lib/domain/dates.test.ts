import { describe, it, expect } from 'vitest';
import {
  jalaliToGregorian,
  parseCanonicalDate,
  canonicalizeYMD,
  migrateStoredDate,
  isCanonicalDate,
  inferDateOrder,
  normalizeDigits,
  detectCalendarForYear,
  isValidJalaliYMD,
  isValidGregorianYMD
} from './dates';
import { gregorianToJalali } from '../engine/calendar';

describe('jalaliToGregorian', () => {
  it('matches known anchors', () => {
    expect(jalaliToGregorian(1403, 5, 12)).toEqual([2024, 8, 2]);
    expect(jalaliToGregorian(1404, 5, 12)).toEqual([2025, 8, 3]);
    expect(jalaliToGregorian(1399, 1, 1)).toEqual([2020, 3, 20]);
    expect(jalaliToGregorian(1402, 12, 29)).toEqual([2024, 3, 19]);
  });

  it('round-trips against the display converter across many years', () => {
    let checked = 0;
    for (let y = 1990; y <= 2035; y++) {
      for (let m = 1; m <= 12; m++) {
        for (const d of [1, 15, 28]) {
          const [jy, jm, jd] = gregorianToJalali(y, m, d);
          expect(jalaliToGregorian(jy, jm, jd)).toEqual([y, m, d]);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('handles the Jalali leap day', () => {
    expect(isValidJalaliYMD(1403, 12, 30)).toBe(true);
    expect(isValidJalaliYMD(1402, 12, 30)).toBe(false);
  });
});

describe('parseCanonicalDate', () => {
  it('converts Jalali input to canonical Gregorian ISO', () => {
    const result = parseCanonicalDate('1403/05/12');
    expect(result).toEqual({
      ok: true,
      date: '2024-08-02',
      sourceCalendar: 'jalali',
      converted: true
    });
  });

  it('converts dash-separated Jalali input', () => {
    const result = parseCanonicalDate('1403-01-01');
    expect(result.ok && result.date).toBe('2024-03-20');
  });

  it('leaves canonical Gregorian dates unchanged', () => {
    const result = parseCanonicalDate('2024-06-15');
    expect(result).toEqual({
      ok: true,
      date: '2024-06-15',
      sourceCalendar: 'gregorian',
      converted: false
    });
  });

  it('rejects impossible Gregorian dates', () => {
    expect(parseCanonicalDate('2025-02-31')).toMatchObject({ ok: false, reason: 'impossible' });
    expect(parseCanonicalDate('2025-13-01')).toMatchObject({ ok: false, reason: 'impossible' });
  });

  it('rejects impossible Jalali dates', () => {
    // Esfand has 29 days in a non-leap Jalali year.
    expect(parseCanonicalDate('1402-12-30')).toMatchObject({ ok: false, reason: 'impossible' });
  });

  it('surfaces ambiguous day/month ordering instead of guessing', () => {
    expect(parseCanonicalDate('01/02/2024')).toMatchObject({
      ok: false,
      reason: 'ambiguous_calendar'
    });
  });

  it('resolves ambiguity when an explicit order is supplied', () => {
    expect(parseCanonicalDate('01/02/2024', { order: 'mdy' }).ok && parseCanonicalDate('01/02/2024', { order: 'mdy' })).toMatchObject({ date: '2024-01-02' });
    expect(parseCanonicalDate('01/02/2024', { order: 'dmy' })).toMatchObject({ date: '2024-02-01' });
  });

  it('resolves unambiguous orderings automatically', () => {
    expect(parseCanonicalDate('15/06/2024')).toMatchObject({ date: '2024-06-15' });
    expect(parseCanonicalDate('06/15/2024')).toMatchObject({ date: '2024-06-15' });
  });

  it('never uses the host timezone (no Date() fallback)', () => {
    // "March 3, 2025" used to go through new Date() + toISOString(), yielding
    // 2025-03-02 in any UTC+ timezone.
    expect(parseCanonicalDate('March 3, 2025')).toMatchObject({ ok: false });
  });

  it('rejects month-name forms rather than mis-parsing them', () => {
    // "3-Mar-2025" previously produced the literal string "2025-NaN-03".
    const result = parseCanonicalDate('3-Mar-2025');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unparseable');
  });

  it('accepts Persian digits', () => {
    expect(parseCanonicalDate('۱۴۰۳/۰۵/۱۲')).toMatchObject({ date: '2024-08-02' });
  });

  it('strips a trailing time component', () => {
    expect(parseCanonicalDate('2024-06-15 23:59')).toMatchObject({ date: '2024-06-15' });
    expect(parseCanonicalDate('2024-06-15T08:00:00Z')).toMatchObject({ date: '2024-06-15' });
  });

  it('rejects empty input', () => {
    expect(parseCanonicalDate('')).toMatchObject({ ok: false, reason: 'empty' });
    expect(parseCanonicalDate('   ')).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('rejects two-digit years as ambiguous', () => {
    expect(parseCanonicalDate('2/3/25')).toMatchObject({ ok: false });
  });

  it('rejects years outside both calendar ranges', () => {
    expect(parseCanonicalDate('0500-01-01')).toMatchObject({ ok: false, reason: 'year_out_of_range' });
  });
});

describe('canonicalizeYMD', () => {
  it('honours an explicit source calendar over year-range detection', () => {
    // Year 1403 looks Jalali, but an explicit Gregorian context wins.
    const result = canonicalizeYMD(1403, 5, 12, { sourceCalendar: 'gregorian' });
    expect(result).toMatchObject({ ok: true, date: '1403-05-12', converted: false });
  });
});

describe('detectCalendarForYear', () => {
  it('classifies only unambiguous ranges', () => {
    expect(detectCalendarForYear(1403)).toBe('jalali');
    expect(detectCalendarForYear(2024)).toBe('gregorian');
    expect(detectCalendarForYear(999)).toBeNull();
    expect(detectCalendarForYear(3000)).toBeNull();
  });
});

describe('migrateStoredDate', () => {
  it('migrates a stored Jalali date to Gregorian', () => {
    expect(migrateStoredDate('1403-05-12')).toEqual({ date: '2024-08-02', migrated: true });
  });

  it('leaves an existing Gregorian date byte-identical', () => {
    expect(migrateStoredDate('2024-06-15')).toEqual({ date: '2024-06-15', migrated: false });
  });

  it('does not rewrite values it cannot convert reliably', () => {
    expect(migrateStoredDate('1402-12-30')).toEqual({ date: '1402-12-30', migrated: false });
    expect(migrateStoredDate('not-a-date')).toEqual({ date: 'not-a-date', migrated: false });
    expect(migrateStoredDate('')).toEqual({ date: '', migrated: false });
  });

  it('is idempotent', () => {
    const once = migrateStoredDate('1403-05-12').date;
    expect(migrateStoredDate(once)).toEqual({ date: once, migrated: false });
  });
});

describe('isCanonicalDate', () => {
  it('accepts only real Gregorian ISO dates', () => {
    expect(isCanonicalDate('2024-06-15')).toBe(true);
    expect(isCanonicalDate('1403-05-12')).toBe(false);
    expect(isCanonicalDate('2024-02-31')).toBe(false);
    expect(isCanonicalDate('2024-6-15')).toBe(false);
  });
});

describe('inferDateOrder', () => {
  it('infers day-first from a discriminating value', () => {
    expect(inferDateOrder(['01/02/2024', '15/06/2024'])).toBe('dmy');
  });

  it('infers month-first from a discriminating value', () => {
    expect(inferDateOrder(['01/02/2024', '06/15/2024'])).toBe('mdy');
  });

  it('stays undecided when the column has no discriminator', () => {
    expect(inferDateOrder(['01/02/2024', '03/04/2024'])).toBe('auto');
  });

  it('stays undecided when evidence conflicts', () => {
    expect(inferDateOrder(['15/06/2024', '06/15/2024'])).toBe('auto');
  });

  it('ignores ISO values, which are never ambiguous', () => {
    expect(inferDateOrder(['2024-06-15', '2024-01-02'])).toBe('auto');
  });
});

describe('normalizeDigits', () => {
  it('converts Persian and Arabic-Indic digits', () => {
    expect(normalizeDigits('۱۲۳۴۵')).toBe('12345');
    expect(normalizeDigits('٤٥٦')).toBe('456');
    expect(normalizeDigits('abc123')).toBe('abc123');
  });
});

describe('isValidGregorianYMD', () => {
  it('rejects NaN components', () => {
    expect(isValidGregorianYMD(2025, NaN, 3)).toBe(false);
    expect(isValidGregorianYMD(NaN, 1, 1)).toBe(false);
  });

  it('handles leap years', () => {
    expect(isValidGregorianYMD(2024, 2, 29)).toBe(true);
    expect(isValidGregorianYMD(2025, 2, 29)).toBe(false);
    expect(isValidGregorianYMD(2000, 2, 29)).toBe(true);
    expect(isValidGregorianYMD(1900, 2, 29)).toBe(false);
  });
});
