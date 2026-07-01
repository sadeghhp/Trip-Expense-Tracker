import type { Expense, Participant, Currency, PendingImportItem, CsvJournalEntry } from '../types';
import type { CsvRow } from './csv-parser';
import type { ColumnMapping } from './csv-mapper';
import { generateId } from './id';

export function buildExpenseFromPendingItem(
  item: PendingImportItem,
  participants: Participant[],
  currencies: Currency[],
  tankhahParticipantId?: string
): Expense {
  const payerId = item.payerName
    ? participants.find(p => p.name.toLowerCase() === item.payerName!.toLowerCase())?.id
    : undefined;

  const groupParticipants = tankhahParticipantId
    ? participants.filter(p => p.id !== tankhahParticipantId)
    : participants;

  return {
    id: '',
    date: item.date ?? '',
    description: item.description ?? '',
    currencyCode: item.currencyCode ?? currencies[0]?.code ?? '',
    amount: item.amount ?? 0,
    paidBy: payerId ?? participants[0]?.id ?? '',
    splitType: 'equal',
    beneficiaries: groupParticipants.map(p => ({
      participantId: p.id,
      customAmount: null,
      customPercentage: null
    })),
    ...(item.entryType === 'expense_treat' ? { isTreat: true } : {})
  };
}

function journalIdForRow(row: CsvRow, mapping: ColumnMapping, rowNum: number): string {
  return mapping.id ? (row[mapping.id]?.trim() || `row-${rowNum}`) : `row-${rowNum}`;
}

export function buildRawDataByJournalId(
  rows: CsvRow[],
  mapping: ColumnMapping
): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const journalId = journalIdForRow(rows[i], mapping, rowNum);
    map.set(journalId, { ...rows[i] });
  }
  return map;
}

export function buildPendingItemsFromJournalEntries(
  rows: CsvRow[],
  entries: CsvJournalEntry[],
  mapping: ColumnMapping
): PendingImportItem[] {
  const rawById = buildRawDataByJournalId(rows, mapping);
  const now = new Date().toISOString();
  const items: PendingImportItem[] = [];

  for (const entry of entries) {
    if (entry.status !== 'skipped' || !entry.skipReason) continue;

    items.push({
      id: generateId(),
      rawData: rawById.get(entry.journalId) ?? {},
      reason: entry.skipReason,
      createdAt: now,
      date: entry.date || undefined,
      description: entry.description || undefined,
      amount: entry.amount > 0 ? entry.amount : undefined,
      currencyCode: entry.currency || undefined,
      payerName: entry.payer || undefined,
      payeeName: entry.payee || undefined,
      entryType: entry.entryType || undefined
    });
  }

  return items;
}

export function extractDescriptionPayeeNames(
  participantMappings: { csvName: string; isDescription: boolean }[]
): string[] {
  return participantMappings
    .filter(pm => pm.isDescription)
    .map(pm => pm.csvName);
}
