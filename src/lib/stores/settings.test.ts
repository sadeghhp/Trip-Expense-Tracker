import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../i18n', () => ({
  setLocale: vi.fn()
}));

import { setLocale } from '../i18n';
import { settings, setTheme, setAppLocale } from './settings';

describe('settings store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('uses defaults when no localStorage data', () => {
    const s = get(settings);
    expect(s.calendar).toBe('gregorian');
    expect(s.theme).toBe('light');
    expect(['en', 'fa']).toContain(s.locale);
  });

  it('loads valid localStorage data', () => {
    localStorage.setItem('trip-expense-tracker-settings', JSON.stringify({
      calendar: 'jalali',
      theme: 'dark',
      locale: 'fa'
    }));
    vi.resetModules();
    return import('./settings').then(mod => {
      const s = get(mod.settings);
      expect(s.calendar).toBe('jalali');
      expect(s.theme).toBe('dark');
      expect(s.locale).toBe('fa');
    });
  });

  it('applies dark theme class', () => {
    setTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    setTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('calls setLocale when locale changes', () => {
    setAppLocale('fa');
    expect(setLocale).toHaveBeenCalledWith('fa');
  });

  it('persists settings to localStorage on update', () => {
    setTheme('dark');
    const raw = localStorage.getItem('trip-expense-tracker-settings');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).theme).toBe('dark');
  });

  it('migrates legacy locale key when settings missing', () => {
    localStorage.setItem('trip-expense-tracker-locale', 'fa');
    vi.resetModules();
    return import('./settings').then(mod => {
      expect(get(mod.settings).locale).toBe('fa');
    });
  });
});
