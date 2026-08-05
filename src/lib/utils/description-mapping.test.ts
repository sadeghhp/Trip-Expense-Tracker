/**
 * H2: the "treat this payee as a description" decisions must be persisted and
 * reused, so a later Apply / Apply All / re-apply resolves beneficiaries
 * exactly as the original import did.
 *
 * The wizard used to derive the persisted names from the step-3 mapping list,
 * whose entries always carry `isDescription: false`, so the stored list was
 * always empty and re-apply produced a different split (or failed outright).
 */
import { describe, it, expect } from 'vitest';
import { extractDescriptionPayeeNames } from './pending-import';
import { transformCsvToExpenses, type ParticipantMapping } from './csv-transformer';
import {
  transformJournalEntry,
  buildTransformContext,
  descriptionNamesFromData
} from './journal-apply';
import { buildParticipantLookup } from '../domain/beneficiaries';
import { normalizeData } from './normalize';
import type { ColumnMapping } from './csv-mapper';
import type { CsvRow } from './csv-parser';
import type { AppData, JournalEntry } from '../types';
import { makeAppData } from '../../test/factories';

const mapping: ColumnMapping = {
  date: 'Date',
  description: 'Description',
  amount: 'Amount',
  currency: 'Currency',
  payer: 'Payer',
  payee: 'Payee',
  entryType: null,
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

/** Step 3 entries are always isDescription:false; the decisions live in step 4. */
const stepThreeMappings: ParticipantMapping[] = [
  { csvName: 'Alice', participantId: 'p-1', createNew: false, isDescription: false },
  { csvName: 'Bob', participantId: 'p-2', createNew: false, isDescription: false }
];

/** The merged list actually handed to the transform. */
const mergedMappings: ParticipantMapping[] = [
  ...stepThreeMappings,
  { csvName: 'Restaurant X', participantId: null, createNew: false, isDescription: true }
];

const rows: CsvRow[] = [
  {
    JournalId: 'J-1',
    Date: '2024-06-15',
    Description: 'Dinner',
    Amount: '90',
    Currency: 'USD',
    Payer: 'Alice',
    Payee: 'Restaurant X'
  }
];

describe('extractDescriptionPayeeNames', () => {
  it('returns nothing for the step-3 list alone (the original defect)', () => {
    expect(extractDescriptionPayeeNames(stepThreeMappings)).toEqual([]);
  });

  it('returns the decisions from the merged list', () => {
    expect(extractDescriptionPayeeNames(mergedMappings)).toEqual(['Restaurant X']);
  });

  it('de-duplicates case-insensitively', () => {
    expect(
      extractDescriptionPayeeNames([
        { csvName: 'Shop', isDescription: true },
        { csvName: 'shop', isDescription: true }
      ])
    ).toEqual(['Shop']);
  });
});

describe('description payee resolution is stable across import and re-apply', () => {
  it('splits across the whole group at import time', () => {
    const result = transformCsvToExpenses(
      rows,
      mapping,
      mergedMappings,
      participants,
      currencies,
      []
    );

    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0].beneficiaries).toHaveLength(2);
    expect(result.expenses[0].description).toContain('Restaurant X');
  });

  it('re-apply reproduces the same beneficiaries when the names are persisted', () => {
    const persisted = extractDescriptionPayeeNames(mergedMappings);
    const data: AppData = makeAppData({
      participants,
      currencies,
      descriptionPayeeNames: persisted
    });

    const journal: JournalEntry = {
      id: 'j-1',
      journalId: 'J-1',
      rawData: {},
      date: '2024-06-15',
      description: 'Dinner',
      amount: 90,
      currencyCode: 'USD',
      payerName: 'Alice',
      payeeName: 'Restaurant X',
      entryType: '',
      status: 'pending',
      expenseId: null,
      updatedAt: '2024-06-15T00:00:00.000Z'
    };

    const context = buildTransformContext(
      data,
      buildParticipantLookup(participants),
      descriptionNamesFromData(data),
      'j-1'
    );
    const result = transformJournalEntry(journal, context);

    expect(result.error).toBeNull();
    expect(result.expense?.beneficiaries).toHaveLength(2);
  });

  it('re-apply fails without the persisted names, proving they matter', () => {
    // With descriptionPayeeNames empty, "Restaurant X" is treated as a person
    // and cannot be resolved.
    const data: AppData = makeAppData({ participants, currencies });
    const journal: JournalEntry = {
      id: 'j-1',
      journalId: 'J-1',
      rawData: {},
      date: '2024-06-15',
      description: 'Dinner',
      amount: 90,
      currencyCode: 'USD',
      payerName: 'Alice',
      payeeName: 'Restaurant X',
      entryType: '',
      status: 'pending',
      expenseId: null,
      updatedAt: '2024-06-15T00:00:00.000Z'
    };

    const context = buildTransformContext(
      data,
      buildParticipantLookup(participants),
      descriptionNamesFromData(data),
      'j-1'
    );
    const result = transformJournalEntry(journal, context);
    expect(result.error).toBe('Could not determine beneficiaries');
  });

  it('survives a persistence round trip', () => {
    const persisted = extractDescriptionPayeeNames(mergedMappings);
    const stored = normalizeData(
      makeAppData({ participants, currencies, descriptionPayeeNames: persisted })
    );
    expect(stored.descriptionPayeeNames).toEqual(['Restaurant X']);
    expect(descriptionNamesFromData(stored).has('restaurant x')).toBe(true);
  });

  it('matches case-insensitively after reload', () => {
    const stored = normalizeData(
      makeAppData({ participants, currencies, descriptionPayeeNames: ['Restaurant X'] })
    );
    const names = descriptionNamesFromData(stored);
    expect(names.has('restaurant x')).toBe(true);
  });
});
