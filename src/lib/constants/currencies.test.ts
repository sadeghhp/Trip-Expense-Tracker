import { describe, it, expect } from 'vitest';
import { PREDEFINED_CURRENCIES, WIZARD_CURRENCIES } from './currencies';

describe('PREDEFINED_CURRENCIES', () => {
  it('is a non-empty array', () => {
    expect(PREDEFINED_CURRENCIES.length).toBeGreaterThan(0);
  });

  it('each entry has code, symbol, and name', () => {
    for (const c of PREDEFINED_CURRENCIES) {
      expect(c.code).toBeTruthy();
      expect(c.symbol).toBeTruthy();
      expect(c.name).toBeTruthy();
    }
  });

  it('has no duplicate currency codes', () => {
    const codes = PREDEFINED_CURRENCIES.map(c => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('WIZARD_CURRENCIES', () => {
  it('is a subset of PREDEFINED_CURRENCIES', () => {
    const predefinedCodes = new Set(PREDEFINED_CURRENCIES.map(c => c.code));
    for (const c of WIZARD_CURRENCIES) {
      expect(predefinedCodes.has(c.code)).toBe(true);
    }
  });

  it('is non-empty', () => {
    expect(WIZARD_CURRENCIES.length).toBeGreaterThan(0);
  });
});
