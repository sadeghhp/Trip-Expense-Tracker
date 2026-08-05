import { describe, it, expect } from 'vitest';
import {
  classifyEntryType,
  isExpenseEntryType,
  nonExpenseReason,
  isSwappedEntryType,
  isTreatEntryType,
  EXPENSE_ENTRY_TYPES,
  NON_EXPENSE_ENTRY_TYPES
} from './entry-types';

describe('classifyEntryType', () => {
  it('accepts every expense type', () => {
    for (const type of EXPENSE_ENTRY_TYPES) {
      expect(classifyEntryType(type).kind).toBe('expense');
      expect(isExpenseEntryType(type)).toBe(true);
      expect(nonExpenseReason(type)).toBeNull();
    }
  });

  it('refuses every non-expense ledger movement', () => {
    for (const type of NON_EXPENSE_ENTRY_TYPES) {
      expect(classifyEntryType(type).kind).toBe('non_expense');
      expect(isExpenseEntryType(type)).toBe(false);
      expect(nonExpenseReason(type)).toContain('Non-expense');
    }
  });

  it('specifically refuses internal ops and non-repayable grants', () => {
    for (const type of ['currency_exchange', 'fund_opening', 'allowance_grant']) {
      expect(isExpenseEntryType(type)).toBe(false);
    }
  });

  it('classifies obligations as expense-forming', () => {
    for (const type of ['withdrawal', 'loan_disbursement', 'advance_received', 'cash_transfer', 'debt_statement']) {
      expect(classifyEntryType(type).kind).toBe('obligation');
      expect(isExpenseEntryType(type)).toBe(true);
      expect(nonExpenseReason(type)).toBeNull();
    }
  });

  it('refuses unrecognized types rather than importing them blindly', () => {
    expect(classifyEntryType('transfer').kind).toBe('unknown');
    expect(isExpenseEntryType('transfer')).toBe(false);
    expect(nonExpenseReason('transfer')).toContain('Non-expense');
  });

  it('treats an absent entry type as a plain expense', () => {
    // Imports whose mapping has no entry-type column must keep working.
    expect(isExpenseEntryType('')).toBe(true);
    expect(isExpenseEntryType(undefined)).toBe(true);
    expect(isExpenseEntryType(null)).toBe(true);
    expect(isExpenseEntryType('   ')).toBe(true);
  });

  it('identifies swapped and treat types', () => {
    expect(isSwappedEntryType('debt_statement')).toBe(true);
    expect(isSwappedEntryType('expense')).toBe(false);
    expect(isTreatEntryType('expense_treat')).toBe(true);
    expect(isTreatEntryType('expense')).toBe(false);
  });

  it('keeps the expense and non-expense sets disjoint', () => {
    for (const type of EXPENSE_ENTRY_TYPES) {
      expect(NON_EXPENSE_ENTRY_TYPES.has(type)).toBe(false);
    }
  });
});
