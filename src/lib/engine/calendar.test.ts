import { describe, it, expect, vi, afterEach } from 'vitest';
import { gregorianToJalali, formatDateDisplay, getTodayISO, getTodayForCalendar } from './calendar';

describe('gregorianToJalali', () => {
  it.each([
    [2024, 3, 20, [1403, 1, 1]],
    [2024, 1, 1, [1402, 10, 11]],
    [2023, 3, 21, [1402, 1, 1]],
    [2020, 3, 20, [1399, 1, 1]],
    [2024, 12, 31, [1403, 10, 11]],
    [2024, 6, 15, [1403, 3, 26]],
    [2025, 3, 20, [1404, 1, 1]],
    [2000, 1, 1, [1378, 10, 11]],
    [2024, 2, 29, [1402, 12, 10]],
    [2024, 7, 1, [1403, 4, 11]],
    [2024, 11, 30, [1403, 9, 10]],
    [2024, 9, 22, [1403, 7, 1]]
  ])('converts %i-%i-%i to Jalali', (gy, gm, gd, expected) => {
    expect(gregorianToJalali(gy, gm, gd)).toEqual(expected);
  });
});

describe('formatDateDisplay', () => {
  it('formats gregorian date', () => {
    expect(formatDateDisplay('2024-06-15', 'gregorian')).toBe('2024/06/15');
  });

  it('formats jalali date', () => {
    expect(formatDateDisplay('2024-03-20', 'jalali')).toBe('1403/01/01');
  });

  it('returns empty string for empty input', () => {
    expect(formatDateDisplay('', 'gregorian')).toBe('');
  });

  it('returns input as-is for invalid format', () => {
    expect(formatDateDisplay('not-a-date', 'gregorian')).toBe('not-a-date');
  });

  it('does not convert jalali for year < 1900', () => {
    expect(formatDateDisplay('1899-06-15', 'jalali')).toBe('1899/06/15');
  });
});

describe('getTodayISO', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns YYYY-MM-DD format', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T15:30:00'));
    expect(getTodayISO()).toBe('2024-06-15');
  });
});

describe('getTodayForCalendar', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns gregorian format', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:00'));
    expect(getTodayForCalendar('gregorian')).toBe('2024-06-15');
  });

  it('returns jalali format', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-20T12:00:00'));
    expect(getTodayForCalendar('jalali')).toBe('1403-01-01');
  });
});
