import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { locale, dir, isRtl, t, setLocale } from './index';

describe('i18n', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('setLocale en sets ltr direction', () => {
    setLocale('en');
    expect(get(dir)).toBe('ltr');
    expect(get(isRtl)).toBe(false);
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('setLocale fa sets rtl direction', () => {
    setLocale('fa');
    expect(get(dir)).toBe('rtl');
    expect(get(isRtl)).toBe(true);
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('t resolves nested English key', () => {
    setLocale('en');
    const translate = get(t);
    expect(translate('common.save')).toBe('Save');
  });

  it('t resolves nested Persian key', () => {
    setLocale('fa');
    const translate = get(t);
    expect(translate('common.save')).toBe('ذخیره');
  });

  it('t interpolates parameters', () => {
    setLocale('en');
    const translate = get(t);
    const text = translate('validation.customSumMismatch', { amount: '100.00', sum: '90.00' });
    expect(text).toContain('100.00');
    expect(text).toContain('90.00');
  });

  it('t returns key for missing translation', () => {
    setLocale('en');
    const translate = get(t);
    expect(translate('nonexistent.key.path')).toBe('nonexistent.key.path');
  });

  it('locale store updates on setLocale', () => {
    setLocale('fa');
    expect(get(locale)).toBe('fa');
  });
});
