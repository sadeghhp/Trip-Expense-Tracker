import { describe, it, expect } from 'vitest';
import { getBeneficiaryShares, getEqualSharePreview } from './shares';
import { makeExpense, makeBeneficiary } from '../../test/factories';

function sumShares(shares: number[]): number {
  return Math.round(shares.reduce((s, v) => s + v, 0) * 100) / 100;
}

describe('getBeneficiaryShares', () => {
  describe('equal split', () => {
    it('splits exactly among 3 people', () => {
      const expense = makeExpense({
        amount: 90,
        paidBy: 'p-1',
        beneficiaries: [
          makeBeneficiary('p-1'),
          makeBeneficiary('p-2'),
          makeBeneficiary('p-3')
        ]
      });
      const shares = getBeneficiaryShares(expense);
      expect(shares).toEqual([30, 30, 30]);
      expect(sumShares(shares)).toBe(90);
    });

    it('distributes remainder when payer is beneficiary', () => {
      const expense = makeExpense({
        amount: 100,
        paidBy: 'p-1',
        beneficiaries: [
          makeBeneficiary('p-1'),
          makeBeneficiary('p-2'),
          makeBeneficiary('p-3')
        ]
      });
      const shares = getBeneficiaryShares(expense);
      expect(sumShares(shares)).toBe(100);
      expect(shares[0]).toBeGreaterThanOrEqual(33.33);
    });

    it('distributes remainder from first when payer is not beneficiary', () => {
      const expense = makeExpense({
        amount: 100,
        paidBy: 'p-0',
        beneficiaries: [
          makeBeneficiary('p-1'),
          makeBeneficiary('p-2'),
          makeBeneficiary('p-3')
        ]
      });
      const shares = getBeneficiaryShares(expense);
      expect(sumShares(shares)).toBe(100);
      const extraCount = shares.filter(s => s > 33.33).length;
      expect(extraCount).toBe(1);
    });

    it('handles 2 remainder cents among 7 people', () => {
      const ids = Array.from({ length: 7 }, (_, i) => `p-${i}`);
      const expense = makeExpense({
        amount: 1,
        paidBy: 'p-0',
        beneficiaries: ids.map(id => makeBeneficiary(id))
      });
      const shares = getBeneficiaryShares(expense);
      expect(sumShares(shares)).toBe(1);
    });

    it('handles single beneficiary', () => {
      const expense = makeExpense({
        amount: 50,
        paidBy: 'p-1',
        beneficiaries: [makeBeneficiary('p-1')]
      });
      expect(getBeneficiaryShares(expense)).toEqual([50]);
    });

    it('handles large group', () => {
      const ids = Array.from({ length: 10 }, (_, i) => `p-${i}`);
      const expense = makeExpense({
        amount: 100,
        paidBy: 'p-5',
        beneficiaries: ids.map(id => makeBeneficiary(id))
      });
      const shares = getBeneficiaryShares(expense);
      expect(shares).toHaveLength(10);
      expect(sumShares(shares)).toBe(100);
    });

    it('handles very small amount split many ways', () => {
      const expense = makeExpense({
        amount: 0.01,
        paidBy: 'p-1',
        beneficiaries: [
          makeBeneficiary('p-1'),
          makeBeneficiary('p-2'),
          makeBeneficiary('p-3')
        ]
      });
      const shares = getBeneficiaryShares(expense);
      expect(sumShares(shares)).toBe(0.01);
    });

    it('handles payer at middle index', () => {
      const expense = makeExpense({
        amount: 10,
        paidBy: 'p-2',
        beneficiaries: [
          makeBeneficiary('p-1'),
          makeBeneficiary('p-2'),
          makeBeneficiary('p-3')
        ]
      });
      const shares = getBeneficiaryShares(expense);
      expect(sumShares(shares)).toBe(10);
    });

    it('handles payer at last index', () => {
      const expense = makeExpense({
        amount: 10,
        paidBy: 'p-3',
        beneficiaries: [
          makeBeneficiary('p-1'),
          makeBeneficiary('p-2'),
          makeBeneficiary('p-3')
        ]
      });
      const shares = getBeneficiaryShares(expense);
      expect(sumShares(shares)).toBe(10);
    });
  });

  describe('custom split', () => {
    it('returns custom amounts as-is', () => {
      const expense = makeExpense({
        amount: 100,
        splitType: 'custom',
        beneficiaries: [
          makeBeneficiary('p-1', { customAmount: 60 }),
          makeBeneficiary('p-2', { customAmount: 40 })
        ]
      });
      expect(getBeneficiaryShares(expense)).toEqual([60, 40]);
    });

    it('treats null customAmount as 0', () => {
      const expense = makeExpense({
        amount: 100,
        splitType: 'custom',
        beneficiaries: [
          makeBeneficiary('p-1', { customAmount: 100 }),
          makeBeneficiary('p-2', { customAmount: null })
        ]
      });
      expect(getBeneficiaryShares(expense)).toEqual([100, 0]);
    });
  });

  describe('percentage split', () => {
    it('splits 50/50 cleanly', () => {
      const expense = makeExpense({
        amount: 100,
        paidBy: 'p-1',
        splitType: 'percentage',
        beneficiaries: [
          makeBeneficiary('p-1', { customPercentage: 50 }),
          makeBeneficiary('p-2', { customPercentage: 50 })
        ]
      });
      const shares = getBeneficiaryShares(expense);
      expect(shares).toEqual([50, 50]);
    });

    it('adjusts rounding difference on payer', () => {
      const expense = makeExpense({
        amount: 100,
        paidBy: 'p-1',
        splitType: 'percentage',
        beneficiaries: [
          makeBeneficiary('p-1', { customPercentage: 33.33 }),
          makeBeneficiary('p-2', { customPercentage: 33.33 }),
          makeBeneficiary('p-3', { customPercentage: 33.34 })
        ]
      });
      const shares = getBeneficiaryShares(expense);
      expect(sumShares(shares)).toBe(100);
    });

    it('adjusts on last person when payer not in beneficiaries', () => {
      const expense = makeExpense({
        amount: 100,
        paidBy: 'p-0',
        splitType: 'percentage',
        beneficiaries: [
          makeBeneficiary('p-1', { customPercentage: 33.33 }),
          makeBeneficiary('p-2', { customPercentage: 33.33 }),
          makeBeneficiary('p-3', { customPercentage: 33.34 })
        ]
      });
      const shares = getBeneficiaryShares(expense);
      expect(sumShares(shares)).toBe(100);
    });

    it('handles 100% to one person', () => {
      const expense = makeExpense({
        amount: 75,
        paidBy: 'p-1',
        splitType: 'percentage',
        beneficiaries: [
          makeBeneficiary('p-1', { customPercentage: 100 }),
          makeBeneficiary('p-2', { customPercentage: 0 })
        ]
      });
      const shares = getBeneficiaryShares(expense);
      expect(sumShares(shares)).toBe(75);
    });

    it('treats null customPercentage as 0%', () => {
      const expense = makeExpense({
        amount: 100,
        paidBy: 'p-1',
        splitType: 'percentage',
        beneficiaries: [
          makeBeneficiary('p-1', { customPercentage: 100 }),
          makeBeneficiary('p-2', { customPercentage: null })
        ]
      });
      const shares = getBeneficiaryShares(expense);
      expect(sumShares(shares)).toBe(100);
    });
  });
});

describe('getEqualSharePreview', () => {
  it('returns payer share and exact flag', () => {
    const result = getEqualSharePreview(90, 'p-1', ['p-1', 'p-2', 'p-3']);
    expect(result).toEqual({ share: 30, exact: true });
  });

  it('returns exact false when remainder exists', () => {
    const result = getEqualSharePreview(100, 'p-1', ['p-1', 'p-2', 'p-3']);
    expect(result.exact).toBe(false);
  });

  it('falls back to index 0 when payer not in list', () => {
    const result = getEqualSharePreview(100, 'p-0', ['p-1', 'p-2', 'p-3']);
    expect(result.share).toBeGreaterThan(0);
  });

  it('returns zero share for empty beneficiaries', () => {
    expect(getEqualSharePreview(100, 'p-1', [])).toEqual({ share: 0, exact: true });
  });
});
