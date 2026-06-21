import { writable, get } from 'svelte/store';
import type { AppData } from '../types';
import { normalizeData } from '../utils/normalize';

const STORAGE_KEY = 'trip-expense-tracker-data';

function createEmptyData(): AppData {
  return {
    participants: [],
    currencies: [],
    expenses: [],
    exchangeRates: {},
    settlementCurrency: ''
  };
}

function loadFromStorage(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyData();
    const parsed = JSON.parse(raw);
    return normalizeData(parsed);
  } catch {
    return createEmptyData();
  }
}

function saveToStorage(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const initial = loadFromStorage();
export const appData = writable<AppData>(initial);

let initialized = false;
appData.subscribe((data) => {
  if (initialized) {
    saveToStorage(data);
  }
  initialized = true;
});

export function updateData(updater: (data: AppData) => AppData): void {
  appData.update(updater);
}

export function replaceData(data: AppData): void {
  appData.set(normalizeData(data));
}

export function clearAllData(): void {
  appData.set(createEmptyData());
}

export function getSnapshot(): AppData {
  return get(appData);
}
