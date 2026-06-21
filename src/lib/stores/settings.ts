import { writable } from 'svelte/store';
import type { AppSettings, CalendarType, LocaleType, ThemeType } from '../types';
import { setLocale } from '../i18n';

const SETTINGS_KEY = 'trip-expense-tracker-settings';
const LEGACY_LOCALE_KEY = 'trip-expense-tracker-locale';

function loadLegacyLocale(): LocaleType | null {
  try {
    const legacy = localStorage.getItem(LEGACY_LOCALE_KEY);
    if (legacy === 'fa' || legacy === 'en') return legacy;
  } catch {}
  return null;
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      const legacyLocale = loadLegacyLocale();
      return { calendar: 'gregorian', theme: 'light', locale: legacyLocale ?? 'en' };
    }
    const parsed = JSON.parse(raw);
    const locale: LocaleType = parsed.locale === 'fa'
      ? 'fa'
      : parsed.locale === 'en'
        ? 'en'
        : (loadLegacyLocale() ?? 'en');
    return {
      calendar: parsed.calendar === 'jalali' ? 'jalali' : 'gregorian',
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      locale
    };
  } catch {
    return { calendar: 'gregorian', theme: 'light', locale: loadLegacyLocale() ?? 'en' };
  }
}

function applyTheme(theme: ThemeType): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

const initial = loadSettings();
export const settings = writable<AppSettings>(initial);

applyTheme(initial.theme);
setLocale(initial.locale);

settings.subscribe((s) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  applyTheme(s.theme);
  setLocale(s.locale);
});

export function setCalendar(cal: CalendarType): void {
  settings.update(s => ({ ...s, calendar: cal }));
}

export function setTheme(theme: ThemeType): void {
  settings.update(s => ({ ...s, theme }));
}

export function toggleTheme(): void {
  settings.update(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }));
}

export function setAppLocale(locale: LocaleType): void {
  settings.update(s => ({ ...s, locale }));
}
