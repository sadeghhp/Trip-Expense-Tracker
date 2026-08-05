import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  transformJournalEntry,
  applyJournalEntryLogic,
  buildTransformContext,
  resolveBeneficiaries,
  buildJournalEntryFromCsvRow,
  csvAuditToActionableJournal,
  descriptionNamesFromData
} from './journal-apply';
import type { CsvJournalEntry } from '../types';
import { makeParticipant, makeCurrency, makeAppData } from '../../test/factories';
import type { JournalEntry } from '../types';

vi.mock('./id', () => ({
  generateId: vi.fn(() => 'generated-expense-id')
}));

function makeJournal(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'journal-1',
    journalId: 'J001',
    rawData: { Payer: 'Alice', Payee: 'Bob' },
    date: '2024-06-15',
    description: 'Lunch',
    amount: 100,
    currencyCode: 'USD',
    payerName: 'Alice',
    payeeName: 'Bob',
    entryType: 'expense',
    status: 'pending',
    expenseId: null,
    updatedAt: '2024-06-15T12:00:00.000Z',
    ...overrides
  };
}

describe('transformJournalEntry', () => {
  const alice = makeParticipant({ id: 'p-alice', name: 'Alice' });
  const bob = makeParticipant({ id: 'p-bob', name: 'Bob' });
  const usd = makeCurrency({ code: 'USD', symbol: '$' });

  function context(data = makeAppData({ participants: [alice, bob], currencies: [usd] })) {
    const lookup = new Map<string, string>([
      ['alice', 'p-alice'],
      ['bob', 'p-bob']
    ]);
    return buildTransformContext(data, lookup, new Set(), 'journal-1');
  }

  it('turns a withdrawal into a repayment obligation (payee owes payer)', () => {
    // Revision: withdrawals/loans/debts are the fund's receivables; the
    // canonical sample ledgers depend on them reaching the settlement.
    const entry = makeJournal({ entryType: 'withdrawal', payeeName: 'Bob' });
    const result = transformJournalEntry(entry, context());
    expect(result.error).toBeNull();
    expect(result.expense?.paidBy).toBe('p-alice');
    expect(result.expense?.beneficiaries.map(b => b.participantId)).toEqual(['p-bob']);
  });

  it('refuses a currency exchange on the apply path', () => {
    const entry = makeJournal({ entryType: 'currency_exchange', payeeName: 'Bob' });
    const result = transformJournalEntry(entry, context());
    expect(result.expense).toBeNull();
    expect(result.excluded).toBe(true);
    expect(result.error).toContain('Non-expense entry type');
  });

  it('creates expense for a genuine expense type', () => {
    const entry = makeJournal({ entryType: 'expense', payeeName: 'Bob' });
    const result = transformJournalEntry(entry, context());
    expect(result.error).toBeNull();
    expect(result.expense?.paidBy).toBe('p-alice');
    expect(result.expense?.beneficiaries).toHaveLength(1);
    expect(result.expense?.beneficiaries[0].participantId).toBe('p-bob');
    expect(result.expense?.source).toBe('journal');
    expect(result.expense?.journalEntryId).toBe('journal-1');
  });

  it('returns error for unknown payer', () => {
    const entry = makeJournal({ payerName: 'Unknown' });
    const result = transformJournalEntry(entry, context());
    expect(result.expense).toBeNull();
    expect(result.error).toContain('Unknown payer');
  });

  it('preserves existing expense id on update', () => {
    const entry = makeJournal({ status: 'applied', expenseId: 'existing-expense' });
    const ctx = buildTransformContext(
      makeAppData({ participants: [alice, bob], currencies: [usd] }),
      new Map([['alice', 'p-alice'], ['bob', 'p-bob']]),
      new Set(),
      'journal-1',
      'existing-expense'
    );
    const result = transformJournalEntry(entry, ctx);
    expect(result.expense?.id).toBe('existing-expense');
  });
});

describe('applyJournalEntryLogic', () => {
  const alice = makeParticipant({ id: 'p-alice', name: 'Alice' });
  const bob = makeParticipant({ id: 'p-bob', name: 'Bob' });
  const usd = makeCurrency();

  it('applies pending journal successfully', () => {
    const data = makeAppData({ participants: [alice, bob], currencies: [usd] });
    const entry = makeJournal();
    const ctx = buildTransformContext(
      data,
      new Map([['alice', 'p-alice'], ['bob', 'p-bob']]),
      new Set(),
      entry.id
    );
    const result = applyJournalEntryLogic(entry, data, ctx);
    expect(result.success).toBe(true);
    expect(result.expense?.amount).toBe(100);
    expect(result.journalPatch?.status).toBe('applied');
  });

  it('blocks out_of_sync without force', () => {
    const data = makeAppData({ participants: [alice, bob], currencies: [usd] });
    const entry = makeJournal({ status: 'out_of_sync', expenseId: 'e-1' });
    const ctx = buildTransformContext(
      data,
      new Map([['alice', 'p-alice'], ['bob', 'p-bob']]),
      new Set(),
      entry.id,
      'e-1'
    );
    const result = applyJournalEntryLogic(entry, data, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toBe('out_of_sync');
  });

  it('applies out_of_sync with force', () => {
    const data = makeAppData({ participants: [alice, bob], currencies: [usd] });
    const entry = makeJournal({ status: 'out_of_sync', expenseId: 'e-1' });
    const ctx = buildTransformContext(
      data,
      new Map([['alice', 'p-alice'], ['bob', 'p-bob']]),
      new Set(),
      entry.id,
      'e-1'
    );
    const result = applyJournalEntryLogic(entry, data, ctx, { force: true });
    expect(result.success).toBe(true);
  });
});

describe('resolveBeneficiaries', () => {
  const alice = makeParticipant({ id: 'p-alice', name: 'Alice' });
  const bob = makeParticipant({ id: 'p-bob', name: 'Bob' });
  const lookup = new Map([['alice', 'p-alice'], ['bob', 'p-bob']]);

  it('group expense splits to all participants', () => {
    const bens = resolveBeneficiaries('all', 'expense_group', 'p-alice', [alice, bob], lookup);
    expect(bens).toHaveLength(2);
  });

  it('expense_treat excludes tankhah from beneficiaries', () => {
    const tankhah = makeParticipant({ id: 'p-tank', name: 'Tankhah' });
    const bens = resolveBeneficiaries('all', 'expense_treat', 'p-alice', [alice, bob, tankhah], lookup, 'p-tank');
    expect(bens).toHaveLength(2);
    expect(bens.map(b => b.participantId)).not.toContain('p-tank');
  });
});

describe('transformJournalEntry treat and description payees', () => {
  const alice = makeParticipant({ id: 'p-alice', name: 'Alice' });
  const bob = makeParticipant({ id: 'p-bob', name: 'Bob' });
  const usd = makeCurrency({ code: 'USD', symbol: '$' });

  it('sets isTreat for expense_treat entry type', () => {
    const data = makeAppData({ participants: [alice, bob], currencies: [usd] });
    const entry = makeJournal({ entryType: 'expense_treat', payeeName: 'all' });
    const ctx = buildTransformContext(
      data,
      new Map([['alice', 'p-alice'], ['bob', 'p-bob']]),
      new Set(),
      entry.id
    );
    const result = transformJournalEntry(entry, ctx);
    expect(result.expense?.isTreat).toBe(true);
  });

  it('treats description payee as group split', () => {
    const data = makeAppData({
      participants: [alice, bob],
      currencies: [usd],
      descriptionPayeeNames: ['Excursion']
    });
    const entry = makeJournal({
      payeeName: 'Excursion',
      entryType: 'expense_group'
    });
    const ctx = buildTransformContext(
      data,
      new Map([['alice', 'p-alice'], ['bob', 'p-bob']]),
      descriptionNamesFromData(data),
      entry.id
    );
    const result = transformJournalEntry(entry, ctx);
    expect(result.error).toBeNull();
    expect(result.expense?.beneficiaries).toHaveLength(2);
    expect(result.expense?.description).toContain('Excursion');
  });
});

describe('buildJournalEntryFromCsvRow', () => {
  it('extracts journal id from mapped column', () => {
    const row = {
      journal_id: 'J42',
      Date: '2024-06-15',
      Description: 'Test',
      Amount: '50',
      Currency: 'USD',
      Payer: 'Alice',
      Payee: 'Bob',
      Type: 'expense'
    };
    const mapping = {
      date: 'Date',
      description: 'Description',
      amount: 'Amount',
      currency: 'Currency',
      payer: 'Payer',
      payee: 'Payee',
      entryType: 'Type',
      id: 'journal_id',
      flag: null,
      notes: null,
  treat: null
    };
    const entry = buildJournalEntryFromCsvRow(row, mapping, 2, 'batch-1');
    expect(entry.journalId).toBe('J42');
    expect(entry.amount).toBe(50);
    expect(entry.importBatchId).toBe('batch-1');
  });
});

describe('csvAuditToActionableJournal', () => {
  const baseAudit: CsvJournalEntry = {
    journalId: 'J001',
    entryId: '',
    sourceFile: '',
    entryType: 'expense',
    date: '2024-06-15',
    description: 'Lunch',
    payer: 'Alice',
    payee: 'Bob',
    currency: 'USD',
    amount: 100,
    flag: '',
    notes: '',
    localNotes: '',
    linkedExpenseId: 'e-1',
    status: 'imported',
    skipReason: ''
  };

  it('maps imported audit entry to applied journal', () => {
    const journal = csvAuditToActionableJournal(baseAudit, {}, 'e-1', 'batch-1');
    expect(journal.status).toBe('applied');
    expect(journal.payerName).toBe('Alice');
    expect(journal.currencyCode).toBe('USD');
    expect(journal.expenseId).toBe('e-1');
    expect(journal.importBatchId).toBe('batch-1');
  });

  it('maps skipped audit entry with reason to error', () => {
    const journal = csvAuditToActionableJournal(
      { ...baseAudit, status: 'skipped', linkedExpenseId: null, skipReason: 'Bad date' },
      {},
      null
    );
    expect(journal.status).toBe('error');
    expect(journal.skipReason).toBe('Bad date');
  });

  it('preserves existing id on re-import', () => {
    const journal = csvAuditToActionableJournal(baseAudit, {}, 'e-1', undefined, 'existing-id');
    expect(journal.id).toBe('existing-id');
  });
});
