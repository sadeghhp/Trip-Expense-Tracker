/**
 * Single source of truth for which ledger rows may become expenses.
 *
 * INVARIANT: a journal/CSV row becomes an `Expense` only when
 * `classifyEntryType(row.entryType).kind === 'expense'`. Initial import,
 * re-import, single Apply, Apply All, journal edit and pending review all
 * consult this module — previously the import path used a whitelist and the
 * apply path used a narrower blacklist, so Apply All could materialise
 * transfers and withdrawals as expenses.
 */

/** Entry types that represent a real, splittable expense. */
export const EXPENSE_ENTRY_TYPES: ReadonlySet<string> = new Set([
  'expense',
  'expense_personal',
  'expense_group',
  'expense_from_tankhah',
  'expense_treat',
  'expense_alipay',
  'payment_from_tankhah'
]);

/**
 * Ledger movements that create a repayment obligation: the payee owes the
 * payer the full amount (a loan, a cash withdrawal from the fund, an advance,
 * or a stated debt). These form single/group-beneficiary expenses — without
 * them the fund could hand out money all trip and never be owed anything,
 * which is exactly what the sample tankhah ledgers record.
 */
export const OBLIGATION_ENTRY_TYPES: ReadonlySet<string> = new Set([
  'withdrawal',
  'advance_received',
  'loan_disbursement',
  'cash_transfer',
  'debt_statement'
]);

/**
 * Ledger movements that must never affect balances: internal fund operations
 * and non-repayable grants (`allowance_grant` is explicitly بلاعوض —
 * non-repayable — in the canonical ledgers). A `cash_transfer` between the
 * fund and itself is filtered by the payer==payee internal rule instead, so
 * only transfers that put fund money in a person's hands create an obligation.
 */
export const NON_EXPENSE_ENTRY_TYPES: ReadonlySet<string> = new Set([
  'currency_exchange',
  'fund_opening',
  'allowance_grant'
]);

/**
 * Entry types whose payer/payee columns are stored the other way round:
 * a debt statement is written debtor -> creditor, so the creditor is the one
 * who effectively "paid" and the debtor is the beneficiary who owes.
 */
export const SWAPPED_ENTRY_TYPES: ReadonlySet<string> = new Set(['debt_statement']);

/**
 * Types for which payer == payee is an internal no-op to skip, not an error
 * in the data. A plain expense with payer == payee is legitimate (someone
 * buying their own coffee); an internal transfer to oneself is not a debt.
 */
export const INTERNAL_WHEN_SELF_ENTRY_TYPES: ReadonlySet<string> = new Set([
  ...OBLIGATION_ENTRY_TYPES,
  'cash_transfer',
  'allowance_grant'
]);

export type EntryTypeClassification =
  | { kind: 'expense' }
  | { kind: 'obligation' }
  | { kind: 'non_expense'; reason: string }
  | { kind: 'unknown'; reason: string };

/**
 * Classifies an entry type.
 *
 * An empty string means the source data has no entry-type column at all; such
 * rows are treated as plain expenses, which preserves the historical behaviour
 * of imports whose mapping omits `entryType`.
 */
export function classifyEntryType(entryType: string | null | undefined): EntryTypeClassification {
  const value = (entryType ?? '').trim();
  if (!value) return { kind: 'expense' };
  if (EXPENSE_ENTRY_TYPES.has(value)) return { kind: 'expense' };
  if (OBLIGATION_ENTRY_TYPES.has(value)) return { kind: 'obligation' };
  if (NON_EXPENSE_ENTRY_TYPES.has(value)) {
    return { kind: 'non_expense', reason: `Non-expense entry type: ${value}` };
  }
  // Unrecognized types are refused: importing an unknown ledger movement as a
  // shared expense is exactly the failure this gate prevents.
  return { kind: 'unknown', reason: `Non-expense entry type: ${value} (unrecognized)` };
}

/** True for rows that are allowed to become expenses (incl. obligations). */
export function isExpenseEntryType(entryType: string | null | undefined): boolean {
  const kind = classifyEntryType(entryType).kind;
  return kind === 'expense' || kind === 'obligation';
}

/**
 * Reason string when a row may not become an expense, else null.
 * Unknown types are rejected too: silently importing an unrecognised ledger
 * movement as a shared expense is the failure mode this module exists to stop.
 */
export function nonExpenseReason(entryType: string | null | undefined): string | null {
  const classification = classifyEntryType(entryType);
  return classification.kind === 'expense' || classification.kind === 'obligation'
    ? null
    : classification.reason;
}

export function isSwappedEntryType(entryType: string | null | undefined): boolean {
  return SWAPPED_ENTRY_TYPES.has((entryType ?? '').trim());
}

/** True when payer == payee makes the row an internal no-op rather than data. */
export function isInternalWhenSelf(entryType: string | null | undefined): boolean {
  return INTERNAL_WHEN_SELF_ENTRY_TYPES.has((entryType ?? '').trim());
}

/** Treat expenses are paid by one participant on behalf of the group, un-split. */
export function isTreatEntryType(entryType: string | null | undefined): boolean {
  return (entryType ?? '').trim() === 'expense_treat';
}
