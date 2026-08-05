import { writable, derived, get } from 'svelte/store';
import type { AppData, AppState, Trip, JournalEntry, Participant, PendingImportItem, CsvJournalEntry, Expense } from '../types';
import { normalizeData, normalizeAppState, stripReceiptImageIds } from '../utils/normalize';
import { generateId } from '../utils/id';
import { deleteReceiptImages, duplicateReceiptImages, existingReceiptImageIds } from '../services/imageStore';
import { showToast } from './toast';
import { applyJournalEntryLogic, buildTransformContext, descriptionNamesFromData, csvAuditToActionableJournal } from '../utils/journal-apply';
import { buildParticipantLookup } from '../domain/beneficiaries';
import { expenseDiffersForSync, syncAuditLink, isRetryableJournalStatus, repairLinkage } from '../domain/journal-link';
import {
  planSettlementCurrencyChange,
  planSettlementCurrencyChangeClearingRates,
  applySettlementChangePlan,
  planCurrencyRemoval,
  type SettlementChangeResult,
  type SettlementChangePlan
} from '../domain/settlement-currency';
import { mergeImportedExpenses, mergeJournalEntries } from '../utils/csv-transformer';
import { mergeActionableJournals } from '../utils/journal-apply';

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

/**
 * Gives incoming expenses their own image records.
 *
 * Importing a trip export into another trip used to keep the source image ids,
 * so two trips referenced one IndexedDB record and deleting either destroyed
 * the other's receipts. Blobs are cloned under fresh ids; a reference whose
 * blob is unavailable is dropped rather than left dangling and misleading.
 */
async function reassignReceiptImageOwnership(data: AppData): Promise<AppData> {
  const incomingIds = collectReceiptImageIds(data);
  if (incomingIds.length === 0) return data;

  const idMap = new Map<string, string>();
  for (const id of new Set(incomingIds)) {
    idMap.set(id, generateId());
  }

  let copied = new Set<string>();
  try {
    const result = await duplicateReceiptImages(idMap);
    copied = new Set(result.copied);
  } catch {
    copied = new Set();
  }

  return {
    ...data,
    expenses: data.expenses.map(e => {
      if (!e.receiptImageId) return e;
      const newId = idMap.get(e.receiptImageId);
      if (newId && copied.has(e.receiptImageId)) {
        return { ...e, receiptImageId: newId };
      }
      const { receiptImageId, ...rest } = e;
      return rest;
    })
  };
}

export async function replaceData(data: AppData): Promise<void> {
  const normalized = await reassignReceiptImageOwnership(normalizeData(data));
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
    if (expense.receiptImageId && !imageIdMap.has(expense.receiptImageId)) {
      imageIdMap.set(expense.receiptImageId, generateId());
    }
  }

  // A missing source blob must not abort the duplicate: it only means that one
  // receipt cannot come along, so its reference is dropped.
  let copied = new Set<string>();
  if (imageIdMap.size > 0) {
    const result = await duplicateReceiptImages(imageIdMap);
    copied = new Set(result.copied);
  }

  clonedData.expenses = clonedData.expenses.map(expense => {
    if (!expense.receiptImageId) return expense;
    const newId = imageIdMap.get(expense.receiptImageId);
    if (newId && copied.has(expense.receiptImageId)) {
      return { ...expense, receiptImageId: newId };
    }
    const { receiptImageId, ...rest } = expense;
    return rest;
  });

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

export interface ReplaceAllResult {
  /** Image references dropped because no blob was available. Never silent. */
  strippedImageIds: string[];
}

export async function replaceAllData(state: AppState): Promise<ReplaceAllResult> {
  const normalized = normalizeAppState(state);

  const allImageIds = collectReceiptImageIdsFromState(normalized);
  let existingIds = new Set<string>();
  if (allImageIds.length > 0) {
    try {
      existingIds = await existingReceiptImageIds(allImageIds);
    } catch {}
  }

  const strippedImageIds = [...new Set(allImageIds)].filter(id => !existingIds.has(id));

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
  return { strippedImageIds };
}

export function auditStatusFromActionable(actionable: JournalEntry): CsvJournalEntry['status'] {
  if (actionable.status === 'applied') {
    return actionable.flag ? 'flagged' : 'imported';
  }
  // out_of_sync / excluded / error / pending are not "imported as-is"; reporting
  // out_of_sync as 'imported' made the audit claim it mirrored the expense.
  return 'skipped';
}

export function auditPatchFromActionable(actionable: JournalEntry): Partial<CsvJournalEntry> {
  const status = auditStatusFromActionable(actionable);
  return {
    date: actionable.date,
    description: actionable.description,
    amount: actionable.amount,
    currency: actionable.currencyCode,
    payer: actionable.payerName,
    payee: actionable.payeeName,
    entryType: actionable.entryType,
    notes: actionable.notes ?? '',
    flag: actionable.flag ?? '',
    linkedExpenseId: actionable.expenseId,
    status,
    skipReason: status === 'skipped' ? (actionable.skipReason ?? '') : ''
  };
}

function syncAuditJournalEntries(
  journalEntries: CsvJournalEntry[] | undefined,
  actionable: JournalEntry
): CsvJournalEntry[] | undefined {
  if (!journalEntries || !actionable.journalId) return journalEntries;
  const patch = auditPatchFromActionable(actionable);
  return journalEntries.map(ae =>
    ae.journalId === actionable.journalId ? { ...ae, ...patch } : ae
  );
}

export function findJournalByJournalId(journalId: string): JournalEntry | undefined {
  return get(appData).journals.find(j => j.journalId === journalId);
}

export function ensureActionableJournal(audit: CsvJournalEntry): JournalEntry {
  const data = get(appData);
  const existing = data.journals.find(j => j.journalId === audit.journalId);
  if (existing) return existing;

  const entry = csvAuditToActionableJournal(audit, {}, audit.linkedExpenseId);
  upsertJournalEntries([entry]);
  return get(appData).journals.find(j => j.id === entry.id) ?? entry;
}

export function updateJournalEntry(id: string, patch: Partial<JournalEntry>): void {
  updateData(d => {
    const journals = d.journals.map(j =>
      j.id === id
        ? { ...j, ...patch, updatedAt: new Date().toISOString() }
        : j
    );
    const updated = journals.find(j => j.id === id);
    const journalEntries = updated
      ? syncAuditJournalEntries(d.journalEntries, updated)
      : d.journalEntries;
    return { ...d, journals, ...(journalEntries ? { journalEntries } : {}) };
  });
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
    descriptionNamesFromData(data),
    entry.id,
    entry.expenseId ?? undefined
  );
  const result = applyJournalEntryLogic(entry, data, context, options);

  if (!result.success) {
    if (result.journalPatch && Object.keys(result.journalPatch).length > 0) {
      updateData(d => {
        const journals = d.journals.map(j =>
          j.id === id ? { ...j, ...result.journalPatch } : j
        );
        const updated = journals.find(j => j.id === id);
        const journalEntries = updated
          ? syncAuditJournalEntries(d.journalEntries, updated)
          : d.journalEntries;
        return { ...d, journals, ...(journalEntries ? { journalEntries } : {}) };
      });
    }
    return { success: false, error: result.error };
  }

  const expense = result.expense!;
  updateData(d => {
    // Merge by id so a re-apply updates in place instead of appending a twin.
    const alreadyPresent = d.expenses.some(e => e.id === expense.id);
    const expenses = alreadyPresent
      ? d.expenses.map(e => (e.id === expense.id ? expense : e))
      : [...d.expenses, expense];

    const journals = d.journals.map(j =>
      j.id === id ? { ...j, ...result.journalPatch } : j
    );
    const updated = journals.find(j => j.id === id);
    const journalEntries = updated
      ? syncAuditJournalEntries(d.journalEntries, updated)
      : d.journalEntries;

    return repairLinkage({
      ...d,
      expenses,
      journals,
      ...(journalEntries ? { journalEntries } : {})
    });
  });

  // No operation reports success unless the state transition actually happened.
  const persisted = get(appData).expenses.some(e => e.id === expense.id);
  if (!persisted) return { success: false, error: 'persist_failed' };

  return { success: true };
}

export interface ApplyAllResult {
  applied: number;
  failed: number;
  /** Non-expense rows that were skipped rather than retried forever. */
  excluded: number;
}

export function applyAllPendingJournals(): ApplyAllResult {
  const data = get(appData);
  let applied = 0;
  let failed = 0;
  let excluded = 0;

  for (const entry of data.journals) {
    if (entry.status === 'excluded') {
      excluded++;
      continue;
    }
    if (!isRetryableJournalStatus(entry.status)) continue;
    const result = applyJournalEntry(entry.id);
    if (result.success) applied++;
    else if (result.error && result.error.startsWith('Non-expense entry type')) excluded++;
    else failed++;
  }

  return { applied, failed, excluded };
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

    // The audit row must stop claiming the journal is imported and linked,
    // otherwise re-importing the file resurrects the deleted entry.
    const journalEntries = syncAuditLink(d.journalEntries, entry.journalId, null, {
      status: 'skipped',
      skipReason: 'Journal entry deleted'
    });

    return {
      ...d,
      expenses,
      journals: d.journals.filter(j => j.id !== id),
      ...(journalEntries ? { journalEntries } : {})
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

export interface PersistResult {
  success: boolean;
  error?: string;
  expenseId?: string;
}

/**
 * Adds an expense and verifies it actually landed in the store.
 *
 * Callers (notably the pending-review wizard) must only treat their own step as
 * done when this reports success; a silently dropped write previously deleted
 * the source pending item and reported "1 added".
 */
export function addExpense(expense: Expense): PersistResult {
  if (!expense.id) return { success: false, error: 'missing_id' };
  if (get(appData).expenses.some(e => e.id === expense.id)) {
    return { success: false, error: 'duplicate_id' };
  }

  updateData(d => ({ ...d, expenses: [...d.expenses, expense] }));

  const persisted = get(appData).expenses.some(e => e.id === expense.id);
  return persisted
    ? { success: true, expenseId: expense.id }
    : { success: false, error: 'persist_failed' };
}

/**
 * Updates an expense in place and maintains the journal linkage invariant:
 * the linked journal is marked out_of_sync only when a field the journal
 * actually mirrors has changed.
 */
export function updateExpense(id: string, next: Expense): PersistResult {
  const before = get(appData).expenses.find(e => e.id === id);
  if (!before) return { success: false, error: 'not_found' };

  const shouldMarkOutOfSync =
    !!next.journalEntryId && expenseDiffersForSync(before, next);

  updateData(d => {
    const expenses = d.expenses.map(e => (e.id === id ? next : e));
    if (!shouldMarkOutOfSync) return { ...d, expenses };

    const journals = d.journals.map(j =>
      j.id === next.journalEntryId && j.status === 'applied'
        ? { ...j, status: 'out_of_sync' as const, updatedAt: new Date().toISOString() }
        : j
    );
    const updated = journals.find(j => j.id === next.journalEntryId);
    const journalEntries = updated
      ? syncAuditJournalEntries(d.journalEntries, updated)
      : d.journalEntries;
    return { ...d, expenses, journals, ...(journalEntries ? { journalEntries } : {}) };
  });

  const persisted = get(appData).expenses.find(e => e.id === id);
  return persisted
    ? { success: true, expenseId: id }
    : { success: false, error: 'persist_failed' };
}

export interface SettlementCurrencyChangeOutcome {
  ok: boolean;
  /** Set when `ok` is false: why the switch was refused. */
  reason?: 'invalid_currency' | 'no_pivot_rate';
  /** Rates dropped because they could not be re-based onto the new currency. */
  clearedRates: string[];
}

/**
 * Atomically switches the settlement currency.
 *
 * Either every retained rate is re-based onto the new currency, or the switch
 * is refused. `force` adopts the currency and clears the rates that cannot be
 * re-based, so the user re-enters them. A new settlement currency is never
 * persisted next to rates still based on the old one.
 */
export function changeSettlementCurrency(
  newCode: string,
  options: { force?: boolean } = {}
): SettlementCurrencyChangeOutcome {
  const data = get(appData);
  const planned = planSettlementCurrencyChange(data, newCode);

  if (planned.ok) {
    updateData(d => applySettlementChangePlan(d, planned.plan));
    return { ok: true, clearedRates: planned.plan.clearedRates };
  }

  if (planned.reason === 'same_currency') {
    return { ok: true, clearedRates: [] };
  }

  if (planned.reason === 'no_pivot_rate' && options.force) {
    const plan = planSettlementCurrencyChangeClearingRates(data, newCode);
    updateData(d => applySettlementChangePlan(d, plan));
    return { ok: true, clearedRates: plan.clearedRates };
  }

  return { ok: false, reason: planned.reason, clearedRates: planned.clearableRates };
}

/** Removes a currency, preserving the settlement-base invariant. */
export function removeCurrency(code: string): { clearedRates: string[] } {
  const plan = planCurrencyRemoval(get(appData), code);
  updateData(d => ({
    ...d,
    currencies: d.currencies.filter(c => c.code !== code),
    settlementCurrency: plan.settlementCurrency,
    exchangeRates: plan.exchangeRates
  }));
  return { clearedRates: plan.clearedRates };
}

export interface CsvImportCommit {
  newParticipants: Participant[];
  newCurrencies: { code: string; symbol: string }[];
  expenses: Expense[];
  auditEntries: CsvJournalEntry[];
  actionableJournals: JournalEntry[];
  pendingItems: PendingImportItem[];
  descriptionPayeeNames: string[];
}

/**
 * Commits a CSV import as one atomic state transition.
 *
 * Expenses merge by id (so re-importing the same file updates rather than
 * duplicates), journals and audit rows merge by journalId, and linkage is
 * repaired so no link can point at a record that does not exist.
 */
export function commitCsvImport(commit: CsvImportCommit): void {
  updateData(d => {
    const existingCurrencyCodes = new Set(d.currencies.map(c => c.code));
    const existingParticipantIds = new Set(d.participants.map(p => p.id));

    const mergedDescriptionNames = [
      ...new Set([...(d.descriptionPayeeNames ?? []), ...commit.descriptionPayeeNames])
    ];

    return repairLinkage({
      ...d,
      participants: [
        ...d.participants,
        ...commit.newParticipants.filter(p => !existingParticipantIds.has(p.id))
      ],
      currencies: [
        ...d.currencies,
        ...commit.newCurrencies.filter(c => !existingCurrencyCodes.has(c.code))
      ],
      expenses: mergeImportedExpenses(d.expenses, commit.expenses),
      journalEntries: mergeJournalEntries(d.journalEntries ?? [], commit.auditEntries),
      journals: mergeActionableJournals(d.journals, commit.actionableJournals),
      pendingImports: [...d.pendingImports, ...commit.pendingItems],
      ...(mergedDescriptionNames.length > 0
        ? { descriptionPayeeNames: mergedDescriptionNames }
        : {})
    });
  });
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
    pendingImports: d.pendingImports.filter(p => p.id !== id)
  }));
}

export function unlinkJournalsOnExpenseDelete(expenseId: string, journalEntryId?: string): void {
  updateData(d => {
    let changed = false;
    const affectedJournalIds: (string | null)[] = [];
    const journals = d.journals.map(j => {
      const linked = (journalEntryId && j.id === journalEntryId) || j.expenseId === expenseId;
      if (!linked) return j;
      changed = true;
      affectedJournalIds.push(j.journalId);
      return {
        ...j,
        status: 'out_of_sync' as const,
        expenseId: null,
        updatedAt: new Date().toISOString()
      };
    });
    if (!changed) return d;

    // Keep the audit trail truthful: its linkedExpenseId pointed at an expense
    // that no longer exists, leaving a dead "view expense" action.
    let journalEntries = d.journalEntries;
    for (const journalId of affectedJournalIds) {
      journalEntries = syncAuditLink(journalEntries, journalId, null, {
        status: 'skipped',
        skipReason: 'Linked expense deleted'
      });
    }

    return { ...d, journals, ...(journalEntries ? { journalEntries } : {}) };
  });
}
