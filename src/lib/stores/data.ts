import { writable, derived, get } from 'svelte/store';
import type { AppData, AppState, Trip } from '../types';
import { normalizeData, normalizeAppState } from '../utils/normalize';
import { generateId } from '../utils/id';

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

export function replaceData(data: AppData): void {
  appState.update((s) => {
    if (!s.activeTripId) return s;
    return {
      ...s,
      trips: s.trips.map((t) =>
        t.id === s.activeTripId
          ? { ...t, data: normalizeData(data), updatedAt: new Date().toISOString() }
          : t
      )
    };
  });
  dataVersion.set(++_dataVersion);
}

export function clearAllData(): void {
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
    data: normalizeData(data)
  };
  appState.update((s) => ({
    ...s,
    trips: [...s.trips, trip],
    activeTripId: trip.id
  }));
}

export function duplicateTrip(tripId: string): void {
  const state = get(appState);
  const source = state.trips.find((t) => t.id === tripId);
  if (!source) return;
  const now = new Date().toISOString();
  const trip: Trip = {
    id: generateId(),
    name: source.name + ' (Copy)',
    description: source.description,
    archived: false,
    createdAt: now,
    updatedAt: now,
    data: JSON.parse(JSON.stringify(source.data))
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

export function replaceAllData(state: AppState): void {
  appState.set(normalizeAppState(state));
  dataVersion.set(++_dataVersion);
}
