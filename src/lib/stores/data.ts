import { writable, derived, get } from 'svelte/store';
import type { AppData, AppState, Trip } from '../types';
import { normalizeData, normalizeAppState, stripReceiptImageIds } from '../utils/normalize';
import { generateId } from '../utils/id';
import { deleteReceiptImages, duplicateReceiptImages, existingReceiptImageIds } from '../services/imageStore';

const STORAGE_KEY = 'trip-expense-tracker-state';
const OLD_STORAGE_KEY = 'trip-expense-tracker-data';

function createEmptyData(): AppData {
  return {
    participants: [],
    currencies: [],
    expenses: [],
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
