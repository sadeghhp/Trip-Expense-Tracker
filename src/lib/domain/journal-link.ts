/**
 * Two-way journal <-> expense linkage invariants.
 *
 * INVARIANTS:
 *  1. If `journal.expenseId === X` then the expense `X` exists and carries
 *     `journalEntryId === journal.id` and `source === 'journal'`.
 *  2. If `expense.journalEntryId === J` then journal `J` exists and either
 *     points back at the expense or is explicitly unlinked (`expenseId: null`)
 *     with a non-applied status.
 *  3. The CSV audit row (`CsvJournalEntry.linkedExpenseId`) mirrors the
 *     actionable journal's `expenseId`.
 *
 * These were previously enforced ad hoc in components, so the CSV wizard could
 * create expenses with no back-reference (out-of-sync tracking never fired) and
 * deletions could leave audit rows pointing at expenses that no longer exist.
 */
import type { AppData, Expense, JournalEntry, CsvJournalEntry } from '../types';

/** Fields whose change makes an applied journal out of sync with its expense. */
const SYNC_RELEVANT_FIELDS = [
  'date',
  'description',
  'currencyCode',
  'amount',
  'paidBy',
  'splitType',
  'isTreat'
] as const;

function beneficiariesDiffer(a: Expense, b: Expense): boolean {
  if (a.beneficiaries.length !== b.beneficiaries.length) return true;
  const key = (e: Expense) =>
    e.beneficiaries
      .map(x => `${x.participantId}:${x.customAmount ?? ''}:${x.customPercentage ?? ''}`)
      .sort()
      .join('|');
  return key(a) !== key(b);
}

/**
 * True when an edit changes something the journal actually mirrors. Cosmetic
 * or unrelated changes (receipt image, AI metadata) must not flip a journal to
 * out_of_sync, because that forces the destructive force-apply path.
 */
export function expenseDiffersForSync(before: Expense, after: Expense): boolean {
  for (const field of SYNC_RELEVANT_FIELDS) {
    const a = before[field] ?? null;
    const b = after[field] ?? null;
    if (a !== b) return true;
  }
  return beneficiariesDiffer(before, after);
}

/** Applies invariant 1 to a freshly built expense. */
export function linkExpenseToJournal(expense: Expense, journalId: string): Expense {
  return { ...expense, journalEntryId: journalId, source: 'journal' };
}

/**
 * Rewrites the audit row for a journal so `linkedExpenseId` always mirrors the
 * actionable journal (invariant 3).
 */
export function syncAuditLink(
  auditEntries: CsvJournalEntry[] | undefined,
  journalId: string | null,
  expenseId: string | null,
  patch: Partial<CsvJournalEntry> = {}
): CsvJournalEntry[] | undefined {
  if (!auditEntries || !journalId) return auditEntries;
  return auditEntries.map(entry =>
    entry.journalId === journalId ? { ...entry, ...patch, linkedExpenseId: expenseId } : entry
  );
}

export interface LinkageIssue {
  kind:
    | 'journal_points_at_missing_expense'
    | 'expense_points_at_missing_journal'
    | 'audit_points_at_missing_expense'
    | 'missing_back_reference';
  journalId?: string;
  expenseId?: string;
}

/**
 * Reports linkage invariant violations. Used by the persistence normalizer to
 * repair legacy data and by tests to prove the invariants hold.
 */
export function findLinkageIssues(data: AppData): LinkageIssue[] {
  const issues: LinkageIssue[] = [];
  const expenseById = new Map(data.expenses.map(e => [e.id, e]));
  const journalById = new Map(data.journals.map(j => [j.id, j]));

  for (const journal of data.journals) {
    if (!journal.expenseId) continue;
    const expense = expenseById.get(journal.expenseId);
    if (!expense) {
      issues.push({ kind: 'journal_points_at_missing_expense', journalId: journal.id, expenseId: journal.expenseId });
      continue;
    }
    if (expense.journalEntryId !== journal.id) {
      issues.push({ kind: 'missing_back_reference', journalId: journal.id, expenseId: expense.id });
    }
  }

  for (const expense of data.expenses) {
    if (expense.journalEntryId && !journalById.has(expense.journalEntryId)) {
      issues.push({ kind: 'expense_points_at_missing_journal', expenseId: expense.id, journalId: expense.journalEntryId });
    }
  }

  for (const audit of data.journalEntries ?? []) {
    if (audit.linkedExpenseId && !expenseById.has(audit.linkedExpenseId)) {
      issues.push({ kind: 'audit_points_at_missing_expense', journalId: audit.journalId, expenseId: audit.linkedExpenseId });
    }
  }

  return issues;
}

/**
 * Repairs linkage so the stored data satisfies the invariants:
 *  - journals pointing at deleted expenses are unlinked and marked out_of_sync
 *    (never silently left as "applied", which made deletions look applied)
 *  - expenses pointing at deleted journals drop the dangling reference
 *  - audit rows mirror the repaired actionable journals
 *  - back-references are restored where the journal is authoritative
 */
export function repairLinkage(data: AppData): AppData {
  const expenseById = new Map(data.expenses.map(e => [e.id, e]));
  const journalById = new Map(data.journals.map(j => [j.id, j]));

  const journals = data.journals.map(journal => {
    if (journal.expenseId && !expenseById.has(journal.expenseId)) {
      return {
        ...journal,
        expenseId: null,
        status: journal.status === 'applied' ? ('out_of_sync' as const) : journal.status
      };
    }
    // An 'applied' journal with nothing to point at cannot be applied. This is
    // the state left behind once a deleted expense id has been nulled out.
    if (!journal.expenseId && journal.status === 'applied') {
      return { ...journal, status: 'out_of_sync' as const };
    }
    return journal;
  });

  const backReferences = new Map<string, string>();
  for (const journal of journals) {
    if (journal.expenseId) backReferences.set(journal.expenseId, journal.id);
  }

  const expenses = data.expenses.map(expense => {
    const owningJournal = backReferences.get(expense.id);
    if (owningJournal) {
      if (expense.journalEntryId === owningJournal && expense.source === 'journal') return expense;
      return { ...expense, journalEntryId: owningJournal, source: 'journal' as const };
    }
    if (expense.journalEntryId && !journalById.has(expense.journalEntryId)) {
      const { journalEntryId, ...rest } = expense;
      return rest;
    }
    return expense;
  });

  const liveExpenseIds = new Set(expenses.map(e => e.id));
  const journalByJournalId = new Map(
    journals.filter(j => j.journalId).map(j => [j.journalId as string, j])
  );

  const journalEntries = data.journalEntries?.map(audit => {
    const actionable = journalByJournalId.get(audit.journalId);
    const linked = actionable
      ? actionable.expenseId
      : audit.linkedExpenseId && liveExpenseIds.has(audit.linkedExpenseId)
        ? audit.linkedExpenseId
        : null;
    if (linked === audit.linkedExpenseId) return audit;
    return { ...audit, linkedExpenseId: linked };
  });

  return {
    ...data,
    expenses,
    journals,
    ...(journalEntries ? { journalEntries } : {})
  };
}

/** Journal statuses that Apply All is allowed to retry. */
export function isRetryableJournalStatus(status: JournalEntry['status']): boolean {
  return status === 'pending' || status === 'error';
}
