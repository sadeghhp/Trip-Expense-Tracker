/**
 * H3: the initial import and the apply path must classify entry types
 * identically. They used to disagree — import used a whitelist, apply used a
 * narrower blacklist — so Apply All could materialise a withdrawal that the
 * import had deliberately skipped.
 */
import { describe, it, expect } from 'vitest';
import { transformCsvToExpenses } from './csv-transformer';
import {
  transformJournalEntry,
  buildTransformContext,
  validateJournalEntryFields,
  csvAuditToActionableJournal
} from './journal-apply';
import { buildParticipantLookup } from '../domain/beneficiaries';
import {
  EXPENSE_ENTRY_TYPES,
  OBLIGATION_ENTRY_TYPES,
  NON_EXPENSE_ENTRY_TYPES,
  isExpenseEntryType
} from '../domain/entry-types';
import { makeAppData } from '../../test/factories';
import type { ColumnMapping } from './csv-mapper';
import type { CsvRow } from './csv-parser';
import type { JournalEntry, CsvJournalEntry } from '../types';

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

const participants = [
  { id: 'p-1', name: 'Alice' },
  { id: 'p-2', name: 'Bob' }
];
const currencies = [{ code: 'USD', symbol: '$' }];

function csvRow(entryType: string): CsvRow {
  return {
    JournalId: `J-${entryType}`,
    Date: '2024-06-15',
    Description: 'Row',
    Amount: '100',
    Currency: 'USD',
    Payer: 'Alice',
    Payee: 'Bob',
    Type: entryType
  };
}

function journal(entryType: string): JournalEntry {
  return {
    id: `j-${entryType}`,
    journalId: `J-${entryType}`,
    rawData: {},
    date: '2024-06-15',
    description: 'Row',
    amount: 100,
    currencyCode: 'USD',
    payerName: 'Alice',
    payeeName: 'Bob',
    entryType,
    status: 'pending',
    expenseId: null,
    updatedAt: '2024-06-15T00:00:00.000Z'
  };
}

function importCreatesExpense(entryType: string): boolean {
  const result = transformCsvToExpenses(
    [csvRow(entryType)],
    mapping,
    [],
    participants,
    currencies,
    []
  );
  return result.expenses.length === 1;
}

function applyCreatesExpense(entryType: string): boolean {
  const data = makeAppData({ participants, currencies });
  const context = buildTransformContext(
    data,
    buildParticipantLookup(participants),
    new Set(),
    `j-${entryType}`
  );
  const result = transformJournalEntry(journal(entryType), context);
  return result.expense !== null;
}

const ALL_TYPES = [
  ...EXPENSE_ENTRY_TYPES,
  ...OBLIGATION_ENTRY_TYPES,
  ...NON_EXPENSE_ENTRY_TYPES,
  'transfer',
  'mystery_type'
];

describe('import and apply classify entry types identically', () => {
  for (const entryType of ALL_TYPES) {
    it(`agrees on "${entryType}"`, () => {
      const viaImport = importCreatesExpense(entryType);
      const viaApply = applyCreatesExpense(entryType);
      expect(viaApply).toBe(viaImport);
      // ...and both agree with the shared policy.
      expect(viaImport).toBe(isExpenseEntryType(entryType));
    });
  }
});

describe('non-expense rows can never become expenses', () => {
  for (const entryType of NON_EXPENSE_ENTRY_TYPES) {
    it(`refuses "${entryType}" on every path`, () => {
      expect(importCreatesExpense(entryType)).toBe(false);
      expect(applyCreatesExpense(entryType)).toBe(false);
      expect(validateJournalEntryFields(journal(entryType), new Set(['USD']))).toContain(
        'Non-expense'
      );
    });
  }

  it('refuses an unrecognized type', () => {
    expect(importCreatesExpense('transfer')).toBe(false);
    expect(applyCreatesExpense('transfer')).toBe(false);
  });
});

describe('supported expense types still apply correctly', () => {
  for (const entryType of EXPENSE_ENTRY_TYPES) {
    it(`imports and applies "${entryType}"`, () => {
      expect(importCreatesExpense(entryType)).toBe(true);
      expect(applyCreatesExpense(entryType)).toBe(true);
    });
  }

  it('marks a treat expense on both paths', () => {
    const imported = transformCsvToExpenses(
      [csvRow('expense_treat')],
      mapping,
      [],
      participants,
      currencies,
      []
    );
    expect(imported.expenses[0].isTreat).toBe(true);

    const data = makeAppData({ participants, currencies });
    const context = buildTransformContext(
      data,
      buildParticipantLookup(participants),
      new Set(),
      'j-expense_treat'
    );
    const applied = transformJournalEntry(journal('expense_treat'), context);
    expect(applied.expense?.isTreat).toBe(true);
  });

  it('resolves the same beneficiaries on both paths', () => {
    const imported = transformCsvToExpenses(
      [csvRow('expense')],
      mapping,
      [],
      participants,
      currencies,
      []
    );
    const data = makeAppData({ participants, currencies });
    const context = buildTransformContext(
      data,
      buildParticipantLookup(participants),
      new Set(),
      'j-expense'
    );
    const applied = transformJournalEntry(journal('expense'), context);

    expect(applied.expense?.beneficiaries.map(b => b.participantId)).toEqual(
      imported.expenses[0].beneficiaries.map(b => b.participantId)
    );
  });
});

describe('obligation types create expenses with correct direction', () => {
  // Revision note: an earlier pass classified withdrawals/loans/debts as
  // never-expense. The canonical sample ledgers showed that is wrong — these
  // are the fund's receivables; without them the settlement is meaningless.
  for (const entryType of OBLIGATION_ENTRY_TYPES) {
    it(`imports and applies "${entryType}"`, () => {
      expect(importCreatesExpense(entryType)).toBe(true);
      expect(applyCreatesExpense(entryType)).toBe(true);
    });
  }

  it('swaps debtor/creditor for a debt statement at import', () => {
    // "Alice, Bob, debt_statement" means Alice OWES Bob: Bob effectively paid.
    const result = transformCsvToExpenses(
      [csvRow('debt_statement')],
      mapping,
      [],
      participants,
      currencies,
      []
    );
    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0].paidBy).toBe('p-2'); // Bob (creditor)
    expect(result.expenses[0].beneficiaries.map(b => b.participantId)).toEqual(['p-1']); // Alice owes
  });

  it('does not swap a withdrawal (payee owes payer)', () => {
    const result = transformCsvToExpenses(
      [csvRow('withdrawal')],
      mapping,
      [],
      participants,
      currencies,
      []
    );
    expect(result.expenses[0].paidBy).toBe('p-1'); // Alice (the fund) paid
    expect(result.expenses[0].beneficiaries.map(b => b.participantId)).toEqual(['p-2']); // Bob owes
  });
});

describe('payer == payee parity between import and apply', () => {
  function selfRow(entryType: string): CsvRow {
    return { ...csvRow(entryType), JournalId: `SELF-${entryType}`, Payee: 'Alice' };
  }
  function selfJournal(entryType: string): JournalEntry {
    return { ...journal(entryType), id: `sj-${entryType}`, payeeName: 'Alice' };
  }

  it('a plain expense where someone pays for themselves passes BOTH paths', () => {
    // Regression: widening the internal-transfer check to all types made the
    // import create this expense and Apply reject the very same row.
    const imported = transformCsvToExpenses(
      [selfRow('expense')], mapping, [], participants, currencies, []
    );
    expect(imported.expenses).toHaveLength(1);

    const data = makeAppData({ participants, currencies });
    const context = buildTransformContext(
      data, buildParticipantLookup(participants), new Set(), 'sj-expense'
    );
    const applied = transformJournalEntry(selfJournal('expense'), context);
    expect(applied.error).toBeNull();
    expect(applied.expense?.beneficiaries.map(b => b.participantId)).toEqual(['p-1']);
  });

  it('a self-transfer obligation is skipped on BOTH paths', () => {
    const imported = transformCsvToExpenses(
      [selfRow('withdrawal')], mapping, [], participants, currencies, []
    );
    expect(imported.expenses).toHaveLength(0);
    expect(imported.skippedRows[0].reason).toContain('Internal transfer');

    const data = makeAppData({ participants, currencies });
    const context = buildTransformContext(
      data, buildParticipantLookup(participants), new Set(), 'sj-withdrawal'
    );
    const applied = transformJournalEntry(selfJournal('withdrawal'), context);
    expect(applied.expense).toBeNull();
    expect(applied.error).toContain('Internal transfer');
  });
});

describe('audit rows for non-expense types become terminally excluded', () => {
  function audit(entryType: string): CsvJournalEntry {
    return {
      journalId: `J-${entryType}`,
      entryId: '',
      sourceFile: '',
      entryType,
      date: '2024-06-15',
      description: 'Row',
      payer: 'Alice',
      payee: 'Bob',
      currency: 'USD',
      amount: 100,
      flag: '',
      notes: '',
      localNotes: '',
      linkedExpenseId: null,
      status: 'skipped',
      skipReason: 'Non-expense entry type: withdrawal'
    };
  }

  it('maps a currency_exchange audit row to excluded, not error', () => {
    // 'error' rows are retried by Apply All forever; 'excluded' is terminal.
    expect(csvAuditToActionableJournal(audit('currency_exchange'), {}, null).status).toBe('excluded');
  });

  it('maps a withdrawal audit row to error (retryable), since it forms an obligation', () => {
    const withdrawalAudit = { ...audit('withdrawal'), skipReason: 'Unknown payer: Carol' };
    expect(csvAuditToActionableJournal(withdrawalAudit, {}, null).status).toBe('error');
  });

  it('still maps a genuine skipped expense row to error', () => {
    const expenseAudit = { ...audit('expense'), skipReason: 'Unknown payer: Carol' };
    expect(csvAuditToActionableJournal(expenseAudit, {}, null).status).toBe('error');
  });
});
