import { writable, derived, get } from 'svelte/store';
import type { AppData, AppState, Trip, JournalEntry, Participant } from '../types';
import { normalizeData, normalizeAppState, stripReceiptImageIds } from '../utils/normalize';
import { generateId } from '../utils/id';
import { deleteReceiptImages, duplicateReceiptImages, existingReceiptImageIds } from '../services/imageStore';
import { showToast } from './toast';
import { applyJournalEntryLogic, buildTransformContext } from '../utils/journal-apply';

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
let quotaWarningShown = false;

function persistToLocalStorage(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e: unknown) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
      if (!quotaWarningShown) {
        quotaWarningShown = true;
        showToast('Storage full — data may not be saved. Export your data as backup.', 'error');
      }
    }
  }
}

function saveToStorage(state: AppState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistToLocalStorage(state);
    saveTimer = null;
  }, 300);
}

function saveToStorageImmediate(state: AppState): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  persistToLocalStorage(state);
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

function buildParticipantLookup(participants: Participant[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const p of participants) {
    lookup.set(p.name.toLowerCase(), p.id);
  }
  return lookup;
}

export function updateJournalEntry(id: string, patch: Partial<JournalEntry>): void {
  updateData(d => ({
    ...d,
    journals: d.journals.map(j =>
      j.id === id
        ? { ...j, ...patch, updatedAt: new Date().toISOString() }
        : j
    )
  }));
}

export function applyJournalEntry(
  id: string,
  options?: { force?: boolean }
): { success: boolean; error?: string } {
  const data = get(appData);
  const entry = data.journals.find(j => j.id === id);
  if (!entry) return { success: false, error: 'not_found' };

  const lookup = buildParticipantLookup(data.participants);
  const context = buildTransformContext(
    data,
    lookup,
    new Set(),
    entry.id,
    entry.expenseId ?? undefined
  );
  const result = applyJournalEntryLogic(entry, data, context, options);

  if (!result.success) {
    if (result.journalPatch && Object.keys(result.journalPatch).length > 0) {
      updateData(d => ({
        ...d,
        journals: d.journals.map(j =>
          j.id === id ? { ...j, ...result.journalPatch } : j
        )
      }));
    }
    return { success: false, error: result.error };
  }

  const expense = result.expense!;
  updateData(d => {
    const expenses = entry.expenseId
      ? d.expenses.map(e => e.id === entry.expenseId ? expense : e)
      : [...d.expenses, expense];

    return {
      ...d,
      expenses,
      journals: d.journals.map(j =>
        j.id === id ? { ...j, ...result.journalPatch } : j
      )
    };
  });

  return { success: true };
}

export function applyAllPendingJournals(): { applied: number; failed: number } {
  const data = get(appData);
  let applied = 0;
  let failed = 0;

  for (const entry of data.journals) {
    if (entry.status !== 'pending' && entry.status !== 'error') continue;
    const result = applyJournalEntry(entry.id);
    if (result.success) applied++;
    else failed++;
  }

  return { applied, failed };
}

export function markJournalOutOfSync(journalId: string): void {
  updateData(d => ({
    ...d,
    journals: d.journals.map(j =>
      j.id === journalId && j.status === 'applied'
        ? { ...j, status: 'out_of_sync' as const, updatedAt: new Date().toISOString() }
        : j
    )
  }));
}

export function deleteJournalEntry(id: string, deleteExpense = false): void {
  updateData(d => {
    const entry = d.journals.find(j => j.id === id);
    if (!entry) return d;

    let expenses = d.expenses;
    if (entry.expenseId) {
      if (deleteExpense) {
        expenses = expenses.filter(e => e.id !== entry.expenseId);
      } else {
        expenses = expenses.map(e =>
          e.id === entry.expenseId
            ? (() => { const { journalEntryId, ...rest } = e; return rest; })()
            : e
        );
      }
    }

    return {
      ...d,
      expenses,
      journals: d.journals.filter(j => j.id !== id)
    };
  });
}

export function upsertJournalEntries(entries: JournalEntry[]): void {
  updateData(d => {
    const byId = new Map(d.journals.map(j => [j.id, j]));
    for (const entry of entries) {
      byId.set(entry.id, entry);
    }
    return { ...d, journals: [...byId.values()] };
  });
}
