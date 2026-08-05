/**
 * Regression tests for CSV re-import idempotency and journal/expense linkage.
 *
 * Each test below reproduces a defect that the previous implementation had:
 *  - H1: re-import minted new expense ids, dropped the duplicates by content
 *        fingerprint, and overwrote valid links with the discarded ids.
 *  - H3: the import whitelist and the apply blacklist disagreed.
 *  - H7: wizard-created expenses had no back-reference to their journal.
 */
import { describe, it, expect } from 'vitest';
import {
  transformCsvToExpenses,
  buildReconciliation,
  emptyReconciliation,
  mergeImportedExpenses,
  mergeJournalEntries,
  summarizeImport,
  actionableJournalIdMap,
  type ImportResult
} from './csv-transformer';
import {
  buildActionableJournalsFromImport,
  mergeActionableJournals
} from './journal-apply';
import { buildRawDataByJournalId, buildPendingItemsFromJournalEntries } from './pending-import';
import { findLinkageIssues } from '../domain/journal-link';
import type { ColumnMapping } from './csv-mapper';
import type { CsvRow } from './csv-parser';
import type { Participant, Currency, Expense, JournalEntry, CsvJournalEntry, AppData } from '../types';
import { makeAppData } from '../../test/factories';

const mapping: ColumnMapping = {
  date: 'Date',
  description: 'Description',
  amount: 'Amount',
  currency: 'Currency',
  payer: 'Payer',
  payee: 'Payee',
  entryType: 'Type',
  id: 'JournalId',
  flag: null,
  notes: null,
  treat: null
};

const participants: Participant[] = [
  { id: 'p-1', name: 'Alice' },
  { id: 'p-2', name: 'Bob' }
];
const currencies: Currency[] = [{ code: 'USD', symbol: '$' }];

const rows: CsvRow[] = [
  {
    JournalId: 'J-1',
    Date: '2024-06-15',
    Description: 'Lunch',
    Amount: '100',
    Currency: 'USD',
    Payer: 'Alice',
    Payee: 'گروه',
    Type: 'expense'
  },
  {
    JournalId: 'J-2',
    Date: '2024-06-16',
    Description: 'Taxi',
    Amount: '20',
    Currency: 'USD',
    Payer: 'Bob',
    Payee: 'گروه',
    Type: 'expense'
  }
];

/** Runs one import pass against the given store state, returning the new state. */
function runImport(
  state: AppData,
  csvRows: CsvRow[],
  options: { merge?: boolean } = { merge: true }
): { state: AppData; result: ImportResult } {
  const reconciliation = options.merge
    ? buildReconciliation(state.journals, state.expenses)
    : emptyReconciliation();

  const result = transformCsvToExpenses(
    csvRows,
    mapping,
    [],
    state.participants,
    state.currencies,
    [],
    'auto',
    undefined,
    reconciliation
  );

  const actionable = buildActionableJournalsFromImport(
    result.journalEntries,
    buildRawDataByJournalId(csvRows, mapping),
    options.merge ? state.journals : [],
    'batch-1',
    actionableJournalIdMap(result.outcomes)
  );

  const pendingItems = buildPendingItemsFromJournalEntries(
    csvRows,
    result.journalEntries,
    mapping,
    options.merge ? state.pendingImports : []
  );

  const next: AppData = {
    ...state,
    expenses: mergeImportedExpenses(state.expenses, result.expenses),
    journalEntries: mergeJournalEntries(state.journalEntries ?? [], result.journalEntries),
    journals: mergeActionableJournals(state.journals, actionable),
    pendingImports: [...state.pendingImports, ...pendingItems]
  };

  return { state: next, result };
}

function baseState(): AppData {
  return makeAppData({ participants, currencies, expenses: [], journals: [] });
}

describe('CSV re-import idempotency', () => {
  it('importing the same file twice does not duplicate expenses', () => {
    const first = runImport(baseState(), rows);
    expect(first.state.expenses).toHaveLength(2);

    const second = runImport(first.state, rows);
    expect(second.state.expenses).toHaveLength(2);
  });

  it('re-import reuses the same expense ids', () => {
    const first = runImport(baseState(), rows);
    const idsBefore = first.state.expenses.map(e => e.id).sort();

    const second = runImport(first.state, rows);
    const idsAfter = second.state.expenses.map(e => e.id).sort();

    expect(idsAfter).toEqual(idsBefore);
  });

  it('re-import leaves every journal link pointing at a real expense', () => {
    const first = runImport(baseState(), rows);
    const second = runImport(first.state, rows);

    expect(findLinkageIssues(second.state)).toEqual([]);

    const expenseIds = new Set(second.state.expenses.map(e => e.id));
    for (const journal of second.state.journals) {
      if (journal.expenseId) expect(expenseIds.has(journal.expenseId)).toBe(true);
    }
    for (const audit of second.state.journalEntries ?? []) {
      if (audit.linkedExpenseId) expect(expenseIds.has(audit.linkedExpenseId)).toBe(true);
    }
  });

  it('creates no phantom links after three passes', () => {
    let state = baseState();
    for (let i = 0; i < 3; i++) state = runImport(state, rows).state;

    expect(state.expenses).toHaveLength(2);
    expect(findLinkageIssues(state)).toEqual([]);
  });

  it('reports accurate added / updated counts', () => {
    const first = runImport(baseState(), rows);
    expect(summarizeImport(first.result.outcomes)).toMatchObject({ added: 2, updated: 0 });

    const second = runImport(first.state, rows);
    expect(summarizeImport(second.result.outcomes)).toMatchObject({ added: 0, updated: 2 });
  });

  it('does not duplicate an expense the user edited, and leaves the edit intact', () => {
    const first = runImport(baseState(), rows);

    // Simulate a user edit: change the amount and mark the journal out of sync.
    const target = first.state.expenses[0];
    const edited: AppData = {
      ...first.state,
      expenses: first.state.expenses.map(e =>
        e.id === target.id ? { ...e, amount: 999, description: 'Edited' } : e
      ),
      journals: first.state.journals.map(j =>
        j.expenseId === target.id ? { ...j, status: 'out_of_sync' as const } : j
      )
    };

    const second = runImport(edited, rows);

    expect(second.state.expenses).toHaveLength(2);
    const still = second.state.expenses.find(e => e.id === target.id);
    expect(still?.amount).toBe(999);
    expect(still?.description).toBe('Edited');
    expect(findLinkageIssues(second.state)).toEqual([]);
  });

  it('keeps two legitimately identical rows distinct', () => {
    // Same date, payer, amount, currency and description, different journal ids:
    // content fingerprinting collapsed these into one expense.
    const twinRows: CsvRow[] = [
      { ...rows[0], JournalId: 'T-1' },
      { ...rows[0], JournalId: 'T-2' }
    ];
    const { state } = runImport(baseState(), twinRows);
    expect(state.expenses).toHaveLength(2);
    expect(new Set(state.expenses.map(e => e.id)).size).toBe(2);
  });

  it('does not enqueue duplicate pending items on re-import', () => {
    const badRows: CsvRow[] = [
      { ...rows[0], JournalId: 'B-1', Payer: 'Nobody' } // unknown payer -> pending
    ];
    const first = runImport(baseState(), badRows);
    expect(first.state.pendingImports).toHaveLength(1);

    const second = runImport(first.state, badRows);
    expect(second.state.pendingImports).toHaveLength(1);
  });
});

describe('journal <-> expense linkage from the import wizard', () => {
  it('gives every imported expense a back-reference to its journal', () => {
    const { state } = runImport(baseState(), rows);

    for (const expense of state.expenses) {
      expect(expense.source).toBe('journal');
      expect(expense.journalEntryId).toBeTruthy();
      const journal = state.journals.find(j => j.id === expense.journalEntryId);
      expect(journal).toBeDefined();
      expect(journal?.expenseId).toBe(expense.id);
    }
  });

  it('uses the stable actionable journal id in the expense', () => {
    const first = runImport(baseState(), rows);
    const journalIdsBefore = first.state.expenses.map(e => e.journalEntryId).sort();

    const second = runImport(first.state, rows);
    expect(second.state.expenses.map(e => e.journalEntryId).sort()).toEqual(journalIdsBefore);
  });

  it('mirrors the link in the CSV audit trail', () => {
    const { state } = runImport(baseState(), rows);
    for (const audit of state.journalEntries ?? []) {
      if (audit.status === 'skipped') continue;
      const expense = state.expenses.find(e => e.id === audit.linkedExpenseId);
      expect(expense).toBeDefined();
    }
  });
});

describe('entry-type policy at import time', () => {
  const ledgerRows: CsvRow[] = [
    { ...rows[0], JournalId: 'W-1', Type: 'withdrawal' },
    { ...rows[0], JournalId: 'X-1', Type: 'currency_exchange' },
    { ...rows[0], JournalId: 'T-1', Type: 'cash_transfer' },
    { ...rows[0], JournalId: 'E-1', Type: 'expense' }
  ];

  it('imports the expense row and the withdrawal (an obligation), excludes internal ops', () => {
    const { state, result } = runImport(baseState(), ledgerRows);
    expect(state.expenses).toHaveLength(2); // expense + withdrawal obligation
    expect(summarizeImport(result.outcomes)).toMatchObject({ added: 2, excluded: 2 });
  });

  it('marks internal-op rows as terminally excluded, not retryable errors', () => {
    const { state } = runImport(baseState(), ledgerRows);
    const excluded = state.journals.filter(j => j.status === 'excluded');
    expect(excluded).toHaveLength(2); // currency_exchange + cash_transfer
    expect(excluded.every(j => j.status !== 'pending' && j.status !== 'error')).toBe(true);
  });

  it('does not offer internal-op rows for pending review', () => {
    const { state } = runImport(baseState(), ledgerRows);
    expect(state.pendingImports).toHaveLength(0);
  });
});

describe('Jalali dates through the import pipeline', () => {
  it('stores a canonical Gregorian date for a Jalali CSV', () => {
    const jalaliRows: CsvRow[] = [
      { ...rows[0], JournalId: 'JAL-1', Date: '1403/05/12' }
    ];
    const { state } = runImport(baseState(), jalaliRows);
    expect(state.expenses[0].date).toBe('2024-08-02');
  });

  it('sorts imported and manually entered expenses on one timeline', () => {
    const jalaliRows: CsvRow[] = [
      { ...rows[0], JournalId: 'JAL-1', Date: '1403/05/12' } // 2024-08-02
    ];
    const { state } = runImport(baseState(), jalaliRows);

    const manual: Expense = {
      id: 'manual-1',
      date: '2024-07-01',
      description: 'Manual',
      currencyCode: 'USD',
      amount: 10,
      paidBy: 'p-1',
      splitType: 'equal',
      beneficiaries: [{ participantId: 'p-1', customAmount: null, customPercentage: null }]
    };

    const sorted = [...state.expenses, manual].sort((a, b) => a.date.localeCompare(b.date));
    expect(sorted.map(e => e.id)).toEqual(['manual-1', state.expenses[0].id]);
  });

  it('rejects an impossible date with an actionable reason', () => {
    const badRows: CsvRow[] = [{ ...rows[0], JournalId: 'BAD-1', Date: '2024-02-31' }];
    const { result } = runImport(baseState(), badRows);
    expect(result.expenses).toHaveLength(0);
    expect(result.skippedRows[0].reason).toContain('Invalid date');
  });

  it('surfaces an ambiguous date instead of guessing', () => {
    const ambiguousRows: CsvRow[] = [{ ...rows[0], JournalId: 'AMB-1', Date: '01/02/2024' }];
    const { result } = runImport(baseState(), ambiguousRows);
    expect(result.expenses).toHaveLength(0);
    expect(result.skippedRows[0].reason).toContain('ambiguous');
  });

  it('infers day-first ordering from the column as a whole', () => {
    const inferRows: CsvRow[] = [
      { ...rows[0], JournalId: 'D-1', Date: '01/02/2024' },
      { ...rows[0], JournalId: 'D-2', Date: '25/02/2024' }
    ];
    const { result } = runImport(baseState(), inferRows);
    expect(result.expenses).toHaveLength(2);
    // 25/02 can only be day-first, so 01/02 is 1 February.
    expect(result.expenses[0].date).toBe('2024-02-01');
    expect(result.expenses[1].date).toBe('2024-02-25');
  });
});

describe('amount parsing', () => {
  it('reads Persian digits', () => {
    const persianRows: CsvRow[] = [{ ...rows[0], JournalId: 'FA-1', Amount: '۱۲۳۴۵' }];
    const { result } = runImport(baseState(), persianRows);
    expect(result.expenses[0].amount).toBe(12345);
  });

  it('reads both European and US separator conventions', () => {
    const numberRows: CsvRow[] = [
      { ...rows[0], JournalId: 'N-1', Amount: '1.234,56' },
      { ...rows[0], JournalId: 'N-2', Amount: '1,234.56' }
    ];
    const { result } = runImport(baseState(), numberRows);
    expect(result.expenses[0].amount).toBe(1234.56);
    expect(result.expenses[1].amount).toBe(1234.56);
  });
});
