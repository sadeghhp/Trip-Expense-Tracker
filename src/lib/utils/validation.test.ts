import { describe, it, expect } from 'vitest';
import {
  validateParticipantName,
  isParticipantUsed,
  validateCurrencyCode,
  isCurrencyUsed,
  validateExpense,
  validateSettlement
} from './validation';
import { makeExpense, makeBeneficiary, makeAppData } from '../../test/factories';

describe('validateParticipantName', () => {
  it('returns error for empty name', () => {
    expect(validateParticipantName('', [])).toEqual({ key: 'validation.nameRequired' });
  });

  it('returns error for whitespace-only name', () => {
    expect(validateParticipantName('   ', [])).toEqual({ key: 'validation.nameRequired' });
  });

  it('returns error for duplicate name (case-insensitive)', () => {
    expect(validateParticipantName('Alice', ['alice'])).toEqual({ key: 'validation.participantExists' });
  });

  it('returns null for valid unique name', () => {
    expect(validateParticipantName('Charlie', ['Alice', 'Bob'])).toBeNull();
  });

  it('allows same name when excluding id during edit', () => {
    const participants = [{ id: 'p-1', name: 'Alice' }];
    expect(validateParticipantName('Alice', [], 'p-1', participants)).toBeNull();
  });

  it('trims name before validation', () => {
    expect(validateParticipantName('  Bob  ', ['bob'])).toEqual({ key: 'validation.participantExists' });
  });
});

describe('isParticipantUsed', () => {
  it('returns true when participant is payer', () => {
    const expenses = [makeExpense({ paidBy: 'p-1' })];
    expect(isParticipantUsed('p-1', expenses)).toBe(true);
  });

  it('returns true when participant is beneficiary', () => {
    const expenses = [makeExpense({ beneficiaries: [makeBeneficiary('p-2')] })];
    expect(isParticipantUsed('p-2', expenses)).toBe(true);
  });

  it('returns false when not used', () => {
    expect(isParticipantUsed('p-99', [makeExpense()])).toBe(false);
  });

  it('returns false for empty expenses', () => {
    expect(isParticipantUsed('p-1', [])).toBe(false);
  });
});

describe('validateCurrencyCode', () => {
  it('returns error for empty code', () => {
    expect(validateCurrencyCode('', [])).toEqual({ key: 'validation.codeAndSymbolRequired' });
  });

  it('returns error for duplicate code', () => {
    expect(validateCurrencyCode('usd', ['USD'])).toEqual({ key: 'validation.currencyExists' });
  });

  it('allows duplicate when excluding during edit', () => {
    expect(validateCurrencyCode('USD', ['USD'], 'USD')).toBeNull();
  });

  it('returns null for valid unique code', () => {
    expect(validateCurrencyCode('eur', ['USD'])).toBeNull();
  });
});

describe('isCurrencyUsed', () => {
  it('returns true when currency used', () => {
    expect(isCurrencyUsed('USD', [makeExpense({ currencyCode: 'USD' })])).toBe(true);
  });

  it('returns false when not used', () => {
    expect(isCurrencyUsed('EUR', [makeExpense({ currencyCode: 'USD' })])).toBe(false);
  });

  it('returns false for empty expenses', () => {
    expect(isCurrencyUsed('USD', [])).toBe(false);
  });
});

describe('validateExpense', () => {
  const data = makeAppData();

  it('returns error when required fields missing', () => {
    expect(validateExpense({}, data)).toEqual({ key: 'validation.allFieldsRequired' });
  });

  it('returns error for zero amount', () => {
    const expense = makeExpense({ amount: 0 });
    expect(validateExpense(expense, data)?.key).toBe('validation.amountPositive');
  });

  it('returns error for negative amount', () => {
    expect(validateExpense(makeExpense({ amount: -10 }), data)?.key).toBe('validation.amountPositive');
  });

  it('returns error for NaN amount', () => {
    expect(validateExpense(makeExpense({ amount: NaN }), data)?.key).toBe('validation.amountPositive');
  });

  it('returns error when no beneficiaries', () => {
    expect(validateExpense(makeExpense({ beneficiaries: [] }), data)?.key).toBe('validation.selectBeneficiary');
  });

  it('returns error for negative custom amount', () => {
    const expense = makeExpense({
      splitType: 'custom',
      beneficiaries: [
        makeBeneficiary('p-1', { customAmount: -5 }),
        makeBeneficiary('p-2', { customAmount: 105 })
      ]
    });
    expect(validateExpense(expense, data)?.key).toBe('validation.customNegative');
  });

  it('returns error when custom sum mismatches', () => {
    const expense = makeExpense({
      amount: 100,
      splitType: 'custom',
      beneficiaries: [
        makeBeneficiary('p-1', { customAmount: 60 }),
        makeBeneficiary('p-2', { customAmount: 30 })
      ]
    });
    expect(validateExpense(expense, data)?.key).toBe('validation.customSumMismatch');
  });

  it('accepts custom sum within tolerance', () => {
    const expense = makeExpense({
      amount: 100,
      splitType: 'custom',
      beneficiaries: [
        makeBeneficiary('p-1', { customAmount: 50 }),
        makeBeneficiary('p-2', { customAmount: 50.005 })
      ]
    });
    expect(validateExpense(expense, data)).toBeNull();
  });

  it('returns error for negative percentage', () => {
    const expense = makeExpense({
      splitType: 'percentage',
      beneficiaries: [
        makeBeneficiary('p-1', { customPercentage: -10 }),
        makeBeneficiary('p-2', { customPercentage: 110 })
      ]
    });
    expect(validateExpense(expense, data)?.key).toBe('validation.percentageNegative');
  });

  it('returns error when percentages do not sum to 100', () => {
    const expense = makeExpense({
      splitType: 'percentage',
      beneficiaries: [
        makeBeneficiary('p-1', { customPercentage: 40 }),
        makeBeneficiary('p-2', { customPercentage: 40 })
      ]
    });
    expect(validateExpense(expense, data)?.key).toBe('validation.percentageSumMismatch');
  });

  it('accepts valid percentage split', () => {
    const expense = makeExpense({
      splitType: 'percentage',
      beneficiaries: [
        makeBeneficiary('p-1', { customPercentage: 60 }),
        makeBeneficiary('p-2', { customPercentage: 40 })
      ]
    });
    expect(validateExpense(expense, data)).toBeNull();
  });

  it('accepts valid complete expense', () => {
    expect(validateExpense(makeExpense(), data)).toBeNull();
  });
});

describe('validateSettlement', () => {
  it('returns error when no settlement currency', () => {
    expect(validateSettlement('', [{ code: 'USD' }], {})).toEqual({
      key: 'validation.selectSettlementCurrency'
    });
  });

  it('returns error for missing exchange rate', () => {
    expect(
      validateSettlement('USD', [{ code: 'USD' }, { code: 'EUR' }], {})
    )?.key).toBe('validation.invalidExchangeRate');
  });

  it('returns error for zero exchange rate', () => {
    expect(
      validateSettlement('USD', [{ code: 'USD' }, { code: 'EUR' }], { EUR: 0 })
    )?.key).toBe('validation.invalidExchangeRate');
  });

  it('returns error for negative exchange rate', () => {
    expect(
      validateSettlement('USD', [{ code: 'USD' }, { code: 'EUR' }], { EUR: -1 })
    )?.key).toBe('validation.invalidExchangeRate');
  });

  it('returns null when all rates valid', () => {
    expect(
      validateSettlement('USD', [{ code: 'USD' }, { code: 'EUR' }], { EUR: 1.1 })
    ).toBeNull();
  });

  it('returns null when only settlement currency exists', () => {
    expect(validateSettlement('USD', [{ code: 'USD' }], {})).toBeNull();
  });
});
