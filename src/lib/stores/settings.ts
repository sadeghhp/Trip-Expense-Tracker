import { writable } from 'svelte/store';
import type { AppSettings, CalendarType, ThemeType } from '../types';

const SETTINGS_KEY = 'trip-expense-tracker-settings';

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { calendar: 'gregorian', theme: 'light' };
    const parsed = JSON.parse(raw);
    return {
      calendar: parsed.calendar === 'jalali' ? 'jalali' : 'gregorian',
      theme: parsed.theme === 'dark' ? 'dark' : 'light'
    };
  } catch {
    return { calendar: 'gregorian', theme: 'light' };
  }
}

const initial = loadSettings();
export const settings = writable<AppSettings>(initial);

applyTheme(initial.theme);

settings.subscribe((s) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  applyTheme(s.theme);
});

function applyTheme(theme: ThemeType): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function setCalendar(cal: CalendarType): void {
  settings.update(s => ({ ...s, calendar: cal }));
}

export function setTheme(theme: ThemeType): void {
  settings.update(s => ({ ...s, theme }));
}

export function toggleTheme(): void {
  settings.update(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }));
}
