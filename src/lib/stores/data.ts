import { writable, derived, get } from 'svelte/store';
import type { AppData, AppState, Trip, PendingImportItem, JournalEntry } from '../types';
import { normalizeData, normalizeAppState, stripReceiptImageIds } from '../utils/normalize';
import { generateId } from '../utils/id';
import { deleteReceiptImages, duplicateReceiptImages, existingReceiptImageIds } from '../services/imageStore';
import {
  applyJournalEntryLogic,
  buildTransformContext,
  type ApplyResult
} from '../utils/journal-apply';

const STORAGE_KEY = 'trip-expense-tracker-state';
const OLD_STORAGE_KEY = 'trip-expense-tracker-data';

function createEmptyData(): AppData {
  return {
    participants: [],
    currencies: [],
    expenses: [],
    journals: [],
    pendingImports: [],
    exchangeRates: {},
    settlementCurrency: ''
  };
}

function createEmptyState(): AppState {
  return { trips: [], activeTripId: null };
}

function loadFromStorage(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return normalizeAppState(JSON.parse(raw));
    }

    // Migrate from old single-data format
    const oldRaw = localStorage.getItem(OLD_STORAGE_KEY);
    if (oldRaw) {
      const oldData = normalizeData(JSON.parse(oldRaw));
      const hasContent = oldData.participants.length > 0 || oldData.expenses.length > 0 || oldData.currencies.length > 0;
      if (hasContent) {
        const now = new Date().toISOString();
        const trip: Trip = {
          id: generateId(),
          name: 'My Trip',
          description: '',
          archived: false,
          createdAt: now,
          updatedAt: now,
          data: oldData
        };
        const state: AppState = { trips: [trip], activeTripId: trip.id };
        localStorage.removeItem(OLD_STORAGE_KEY);
        return state;
      }
      localStorage.removeItem(OLD_STORAGE_KEY);
    }

    return createEmptyState();
  } catch {
    return createEmptyState();
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function saveToStorage(state: AppState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveTimer = null;
  }, 300);
}

function saveToStorageImmediate(state: AppState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const initial = loadFromStorage();
const appState = writable<AppState>(initial);

let initialized = false;
appState.subscribe((state) => {
  if (initialized) {
    saveToStorage(state);
  }
  initialized = true;
});

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (saveTimer) {
      saveToStorageImmediate(get(appState));
    }
  });
}

export const activeTripId = derived(appState, ($s) => $s.activeTripId);
export const trips = derived(appState, ($s) => $s.trips);
export const activeTrip = derived(appState, ($s) =>
  $s.activeTripId ? $s.trips.find((t) => t.id === $s.activeTripId) ?? null : null
);

export const appData = derived(appState, ($s) => {
  if (!$s.activeTripId) return createEmptyData();
  const trip = $s.trips.find((t) => t.id === $s.activeTripId);
  return trip?.data ?? createEmptyData();
});

export const effectiveSettlementCurrency = derived(appData, ($d) =>
  $d.settlementCurrency || $d.currencies[0]?.code || ''
);

let _dataVersion = 0;
export const dataVersion = writable(_dataVersion);

function collectReceiptImageIds(data: AppData): string[] {
  return data.expenses
    .map(e => e.receiptImageId)
    .filter((id): id is string => !!id);
}

function collectReceiptImageIdsFromState(state: AppState): string[] {
  const ids: string[] = [];
  for (const trip of state.trips) {
    ids.push(...collectReceiptImageIds(trip.data));
  }
  return ids;
}

function deleteUnreferencedReceiptImages(oldIds: string[], newIds: Set<string>): void {
  const toDelete = oldIds.filter(id => !newIds.has(id));
  if (toDelete.length > 0) {
    deleteReceiptImages(toDelete).catch(() => {});
  }
}

function stripOrphanedReceiptImageIds(data: AppData, existingIds: Set<string>): AppData {
  return {
    ...data,
    expenses: data.expenses.map(e => {
      if (!e.receiptImageId) return e;
      if (existingIds.has(e.receiptImageId)) return e;
      const { receiptImageId, ...rest } = e;
      return rest;
    })
  };
}

async function stripOrphanedFromData(data: AppData): Promise<AppData> {
  const imageIds = collectReceiptImageIds(data);
  if (imageIds.length === 0) return data;
  try {
    const existing = await existingReceiptImageIds(imageIds);
    return stripOrphanedReceiptImageIds(data, existing);
  } catch {
    return data;
  }
}

export function updateData(updater: (data: AppData) => AppData): void {
  appState.update((s) => {
    if (!s.activeTripId) return s;
    return {
      ...s,
      trips: s.trips.map((t) =>
        t.id === s.activeTripId
          ? { ...t, data: updater(t.data), updatedAt: new Date().toISOString() }
          : t
      )
    };
  });
  dataVersion.set(++_dataVersion);
}

export async function replaceData(data: AppData): Promise<void> {
  const normalized = await stripOrphanedFromData(normalizeData(data));
  const freshState = get(appState);
  const trip = freshState.trips.find(t => t.id === freshState.activeTripId);
  if (trip) {
    const newIdSet = new Set(collectReceiptImageIds(normalized));
    deleteUnreferencedReceiptImages(collectReceiptImageIds(trip.data), newIdSet);
  }
  appState.update((s) => {
    if (!s.activeTripId) return s;
    return {
      ...s,
      trips: s.trips.map((t) =>
        t.id === s.activeTripId
          ? { ...t, data: normalized, updatedAt: new Date().toISOString() }
          : t
      )
    };
  });
  dataVersion.set(++_dataVersion);
}

export function clearAllData(): void {
  const state = get(appState);
  const trip = state.trips.find(t => t.id === state.activeTripId);
  if (trip) {
    const imageIds = collectReceiptImageIds(trip.data);
    if (imageIds.length > 0) deleteReceiptImages(imageIds).catch(() => {});
  }
  appState.update((s) => {
    if (!s.activeTripId) return s;
    return {
      ...s,
      trips: s.trips.map((t) =>
        t.id === s.activeTripId
          ? { ...t, data: createEmptyData(), updatedAt: new Date().toISOString() }
          : t
      )
    };
  });
  dataVersion.set(++_dataVersion);
}

export function getSnapshot(): AppData {
  return get(appData);
}

export function createTrip(name: string, description: string = ''): void {
  const now = new Date().toISOString();
  const trip: Trip = {
    id: generateId(),
    name,
    description,
    archived: false,
    createdAt: now,
    updatedAt: now,
    data: createEmptyData()
  };
  appState.update((s) => ({
    ...s,
    trips: [...s.trips, trip],
    activeTripId: trip.id
  }));
}

export function deleteTrip(tripId: string): void {
  const state = get(appState);
  const trip = state.trips.find(t => t.id === tripId);
  if (trip) {
    const imageIds = collectReceiptImageIds(trip.data);
    if (imageIds.length > 0) deleteReceiptImages(imageIds).catch(() => {});
  }
  appState.update((s) => ({
    ...s,
    trips: s.trips.filter((t) => t.id !== tripId),
    activeTripId: s.activeTripId === tripId ? null : s.activeTripId
  }));
}

export function switchTrip(tripId: string): void {
  appState.update((s) => ({ ...s, activeTripId: tripId }));
}

export function updateTrip(tripId: string, updates: { name?: string; description?: string }): void {
  appState.update((s) => ({
    ...s,
    trips: s.trips.map((t) =>
      t.id === tripId
        ? { ...t, ...updates, updatedAt: new Date().toISOString() }
        : t
    )
  }));
}

export function exitTrip(): void {
  appState.update((s) => ({ ...s, activeTripId: null }));
}

export function importAsNewTrip(name: string, data: AppData, description: string = ''): void {
  const now = new Date().toISOString();
  const trip: Trip = {
    id: generateId(),
    name,
    description,
    archived: false,
    createdAt: now,
    updatedAt: now,
    data: stripReceiptImageIds(normalizeData(data))
  };
  appState.update((s) => ({
    ...s,
    trips: [...s.trips, trip],
    activeTripId: trip.id
  }));
}

export async function duplicateTrip(tripId: string): Promise<void> {
  const state = get(appState);
  const source = state.trips.find((t) => t.id === tripId);
  if (!source) return;
  const now = new Date().toISOString();
  const clonedData: AppData = JSON.parse(JSON.stringify(source.data));

  const imageIdMap = new Map<string, string>();
  for (const expense of clonedData.expenses) {
    if (expense.receiptImageId) {
      const newImageId = generateId();
      imageIdMap.set(expense.receiptImageId, newImageId);
      expense.receiptImageId = newImageId;
    }
  }

  if (imageIdMap.size > 0) {
    await duplicateReceiptImages(imageIdMap);
  }

  const trip: Trip = {
    id: generateId(),
    name: source.name + ' (Copy)',
    description: source.description,
    archived: false,
    createdAt: now,
    updatedAt: now,
    data: clonedData
  };
  appState.update((s) => ({
    ...s,
    trips: [...s.trips, trip]
  }));
}

export function archiveTrip(tripId: string): void {
  appState.update((s) => ({
    ...s,
    trips: s.trips.map((t) =>
      t.id === tripId ? { ...t, archived: true, updatedAt: new Date().toISOString() } : t
    ),
    activeTripId: s.activeTripId === tripId ? null : s.activeTripId
  }));
}

export function unarchiveTrip(tripId: string): void {
  appState.update((s) => ({
    ...s,
    trips: s.trips.map((t) =>
      t.id === tripId ? { ...t, archived: false, updatedAt: new Date().toISOString() } : t
    )
  }));
}

export function getFullSnapshot(): AppState {
  return get(appState);
}

export function addPendingItems(items: PendingImportItem[]): void {
  if (items.length === 0) return;
  updateData(d => ({
    ...d,
    pendingImports: [...d.pendingImports, ...items]
  }));
}

export function removePendingItem(id: string): void {
  updateData(d => ({
    ...d,
    pendingImports: d.pendingImports.filter(item => item.id !== id)
  }));
}

export function clearAllPendingItems(): void {
  updateData(d => ({
    ...d,
    pendingImports: []
  }));
}

export interface StoreApplyResult extends ApplyResult {
  journalId: string;
}

export interface BulkApplyResult {
  applied: number;
  failed: number;
  errors: { journalId: string; error: string }[];
}

function buildParticipantLookup(data: AppData): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const p of data.participants) {
    lookup.set(p.name.toLowerCase(), p.id);
  }
  return lookup;
}

function upsertExpenseFromApply(data: AppData, expense: import('../types').Expense): AppData {
  const exists = data.expenses.some(e => e.id === expense.id);
  return {
    ...data,
    expenses: exists
      ? data.expenses.map(e => e.id === expense.id ? expense : e)
      : [...data.expenses, expense]
  };
}

export function upsertJournalEntries(entries: JournalEntry[]): void {
  if (entries.length === 0) return;
  updateData(d => {
    const byId = new Map(d.journals.map(j => [j.id, j]));
    const byJournalId = new Map(
      d.journals.filter(j => j.journalId).map(j => [j.journalId!, j])
    );

    for (const entry of entries) {
      const existing = entry.journalId
        ? byJournalId.get(entry.journalId) ?? byId.get(entry.id)
        : byId.get(entry.id);

      if (existing) {
        const merged = { ...existing, ...entry, id: existing.id, updatedAt: new Date().toISOString() };
        byId.set(existing.id, merged);
        if (merged.journalId) byJournalId.set(merged.journalId, merged);
      } else {
        byId.set(entry.id, entry);
        if (entry.journalId) byJournalId.set(entry.journalId, entry);
      }
    }

    return { ...d, journals: Array.from(byId.values()) };
  });
}

export function updateJournalEntry(id: string, patch: Partial<JournalEntry>): void {
  updateData(d => ({
    ...d,
    journals: d.journals.map(j =>
      j.id === id ? { ...j, ...patch, updatedAt: new Date().toISOString() } : j
    )
  }));
}

export function markJournalOutOfSync(journalEntryId: string): void {
  updateData(d => ({
    ...d,
    journals: d.journals.map(j =>
      j.id === journalEntryId && j.status === 'applied'
        ? { ...j, status: 'out_of_sync' as const, updatedAt: new Date().toISOString() }
        : j
    )
  }));
}

export function applyJournalEntry(id: string, options?: { force?: boolean }): StoreApplyResult {
  const data = get(appData);
  const entry = data.journals.find(j => j.id === id);
  if (!entry) {
    return { success: false, error: 'Journal not found', journalId: id };
  }

  const context = buildTransformContext(
    data,
    buildParticipantLookup(data),
    new Set(),
    entry.id,
    entry.expenseId ?? undefined
  );

  const result = applyJournalEntryLogic(entry, data, context, options);
  if (!result.success) {
    if (result.journalPatch && Object.keys(result.journalPatch).length > 0) {
      updateJournalEntry(id, result.journalPatch);
    }
    return { ...result, journalId: id };
  }

  if (!result.expense) {
    return { success: false, error: 'No expense produced', journalId: id };
  }

  updateData(d => {
    const journal = d.journals.find(j => j.id === id);
    if (!journal) return d;

    let next = upsertExpenseFromApply(d, result.expense!);
    next = {
      ...next,
      journals: next.journals.map(j =>
        j.id === id
          ? {
              ...j,
              ...result.journalPatch,
              status: 'applied' as const,
              expenseId: result.expense!.id,
              skipReason: undefined,
              updatedAt: new Date().toISOString()
            }
          : j
      )
    };
    return next;
  });

  return { ...result, journalId: id };
}

export function applyAllPendingJournals(): BulkApplyResult {
  const data = get(appData);
  const pending = data.journals.filter(j =>
    j.status === 'pending' || j.status === 'error'
  );

  const bulk: BulkApplyResult = { applied: 0, failed: 0, errors: [] };

  for (const journal of pending) {
    const result = applyJournalEntry(journal.id);
    if (result.success) {
      bulk.applied++;
    } else {
      bulk.failed++;
      bulk.errors.push({ journalId: journal.id, error: result.error ?? 'Unknown error' });
    }
  }

  return bulk;
}

export function deleteJournalEntry(id: string, deleteExpense: boolean): void {
  updateData(d => {
    const journal = d.journals.find(j => j.id === id);
    if (!journal) return d;

    let expenses = d.expenses;
    if (deleteExpense && journal.expenseId) {
      expenses = expenses.filter(e => e.id !== journal.expenseId);
    } else if (journal.expenseId) {
      expenses = expenses.map(e =>
        e.id === journal.expenseId
          ? { ...e, journalEntryId: undefined, source: e.source === 'journal' ? undefined : e.source }
          : e
      );
    }

    return {
      ...d,
      expenses,
      journals: d.journals.filter(j => j.id !== id)
    };
  });
}

export function importJournalsFromCsvResult(
  journals: JournalEntry[],
  expenses: import('../types').Expense[],
  newParticipants: { name: string; id: string }[],
  newCurrencies: { code: string; symbol: string }[]
): { importedExpenseCount: number } {
  let importedExpenseCount = 0;

  updateData(d => {
    const byJournalId = new Map(
      d.journals.filter(j => j.journalId).map(j => [j.journalId!, j])
    );

    let nextParticipants = [...d.participants];
    for (const p of newParticipants) {
      if (!nextParticipants.some(ep => ep.id === p.id)) {
        nextParticipants.push({ id: p.id, name: p.name });
      }
    }

    let nextCurrencies = [...d.currencies];
    for (const c of newCurrencies) {
      if (!nextCurrencies.some(ec => ec.code === c.code)) {
        nextCurrencies.push({ code: c.code, symbol: c.symbol });
      }
    }

    let nextJournals = [...d.journals];
    let nextExpenses = [...d.expenses];

    for (const incoming of journals) {
      const expense = expenses.find(e => e.journalEntryId === incoming.id);
      const existing = incoming.journalId ? byJournalId.get(incoming.journalId) : undefined;

      if (existing) {
        const updatedJournal: JournalEntry = {
          ...existing,
          rawData: incoming.rawData,
          date: incoming.date,
          description: incoming.description,
          amount: incoming.amount,
          currencyCode: incoming.currencyCode,
          payerName: incoming.payerName,
          payeeName: incoming.payeeName,
          entryType: incoming.entryType,
          notes: incoming.notes,
          flag: incoming.flag,
          importBatchId: incoming.importBatchId,
          updatedAt: new Date().toISOString()
        };

        if (incoming.status === 'applied' && expense && existing.status !== 'out_of_sync') {
          const expenseId = existing.expenseId ?? expense.id;
          const mergedExpense = { ...expense, id: expenseId, journalEntryId: existing.id };
          const idx = nextExpenses.findIndex(e => e.id === expenseId);
          if (idx >= 0) nextExpenses[idx] = mergedExpense;
          else nextExpenses.push(mergedExpense);
          updatedJournal.expenseId = expenseId;
          updatedJournal.status = 'applied';
          updatedJournal.skipReason = undefined;
          importedExpenseCount++;
        } else if (incoming.status === 'error') {
          updatedJournal.status = 'error';
          updatedJournal.skipReason = incoming.skipReason;
        }

        nextJournals = nextJournals.map(j => j.id === existing.id ? updatedJournal : j);
      } else {
        const newId = generateId();
        const newJournal: JournalEntry = {
          ...incoming,
          id: newId
        };

        if (incoming.status === 'applied' && expense) {
          const newExpense = { ...expense, journalEntryId: newId };
          newJournal.expenseId = newExpense.id;
          nextExpenses.push(newExpense);
          importedExpenseCount++;
        }

        nextJournals.push(newJournal);
        if (newJournal.journalId) byJournalId.set(newJournal.journalId, newJournal);
      }
    }

    return {
      ...d,
      participants: nextParticipants,
      currencies: nextCurrencies,
      journals: nextJournals,
      expenses: nextExpenses
    };
  });

  return { importedExpenseCount };
}

export async function replaceAllData(state: AppState): Promise<void> {
  const normalized = normalizeAppState(state);

  const allImageIds = collectReceiptImageIdsFromState(normalized);
  let existingIds = new Set<string>();
  if (allImageIds.length > 0) {
    try {
      existingIds = await existingReceiptImageIds(allImageIds);
    } catch {}
  }

  const strippedTrips = normalized.trips.map(t => ({
    ...t,
    data: stripOrphanedReceiptImageIds(t.data, existingIds)
  }));

  const stripped: AppState = { ...normalized, trips: strippedTrips };
  const oldState = get(appState);
  const newIdSet = new Set(collectReceiptImageIdsFromState(stripped));
  deleteUnreferencedReceiptImages(collectReceiptImageIdsFromState(oldState), newIdSet);
  appState.set(stripped);
  dataVersion.set(++_dataVersion);
}
