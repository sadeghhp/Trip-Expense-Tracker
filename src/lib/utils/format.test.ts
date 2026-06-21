import { describe, it, expect } from 'vitest';
import { formatAmount, getParticipantName, getCurrencySymbol } from './format';
import { makeParticipant, makeCurrency } from '../../test/factories';

describe('formatAmount', () => {
  it('formats integer with 2 decimal places', () => {
    expect(formatAmount(100)).toMatch(/100\.00/);
  });

  it('formats decimal correctly', () => {
    expect(formatAmount(99.9)).toMatch(/99\.90/);
  });

  it('formats zero', () => {
    expect(formatAmount(0)).toMatch(/0\.00/);
  });

  it('formats negative number', () => {
    const result = formatAmount(-50.5);
    expect(result).toContain('50.50');
    expect(result).toMatch(/-/);
  });

  it('formats large number with separators', () => {
    const result = formatAmount(1000000);
    expect(result).toMatch(/1.*000.*000\.00/);
  });
});

describe('getParticipantName', () => {
  const participants = [
    makeParticipant({ id: 'p-1', name: 'Alice' }),
    makeParticipant({ id: 'p-2', name: 'Bob' })
  ];

  it('returns name for valid id', () => {
    expect(getParticipantName('p-1', participants)).toBe('Alice');
  });

  it('returns Unknown for invalid id', () => {
    expect(getParticipantName('p-99', participants)).toBe('Unknown');
  });

  it('returns Unknown for empty participants', () => {
    expect(getParticipantName('p-1', [])).toBe('Unknown');
  });
});

describe('getCurrencySymbol', () => {
  const currencies = [
    makeCurrency({ code: 'USD', symbol: '$' }),
    makeCurrency({ code: 'EUR', symbol: '€' })
  ];

  it('returns symbol for valid code', () => {
    expect(getCurrencySymbol('USD', currencies)).toBe('$');
  });

  it('returns code for invalid code', () => {
    expect(getCurrencySymbol('GBP', currencies)).toBe('GBP');
  });

  it('returns code for empty currencies array', () => {
    expect(getCurrencySymbol('USD', [])).toBe('USD');
  });
});
