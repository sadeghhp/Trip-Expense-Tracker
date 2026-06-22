import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { makeAppData, makeExpense } from '../../test/factories';

vi.mock('../services/imageStore', () => ({
  deleteReceiptImages: vi.fn().mockResolvedValue(undefined),
  duplicateReceiptImages: vi.fn().mockResolvedValue(undefined),
  existingReceiptImageIds: vi.fn().mockResolvedValue(new Set())
}));

import {
  createTrip,
  deleteTrip,
  switchTrip,
  updateTrip,
  exitTrip,
  archiveTrip,
  unarchiveTrip,
  duplicateTrip,
  updateData,
  replaceData,
  clearAllData,
  importAsNewTrip,
  replaceAllData,
  getSnapshot,
  getFullSnapshot,
  trips,
  activeTripId,
  activeTrip,
  appData,
  effectiveSettlementCurrency
} from './data';

describe('data store', () => {
  beforeEach(() => {
    localStorage.clear();
    createTrip('Trip 1');
  });

  it('createTrip adds trip and sets active', () => {
    createTrip('Trip 2');
    const allTrips = get(trips);
    expect(allTrips).toHaveLength(2);
    expect(get(activeTrip)?.name).toBe('Trip 2');
  });

  it('switchTrip changes activeTripId', () => {
    const firstId = get(activeTripId)!;
    createTrip('Trip 2');
    const secondId = get(activeTripId)!;
    switchTrip(firstId);
    expect(get(activeTripId)).toBe(firstId);
    expect(get(activeTripId)).not.toBe(secondId);
  });

  it('updateTrip modifies name and description', () => {
    const id = get(activeTripId)!;
    updateTrip(id, { name: 'Renamed', description: 'Desc' });
    const trip = get(trips).find(t => t.id === id);
    expect(trip?.name).toBe('Renamed');
    expect(trip?.description).toBe('Desc');
    expect(trip?.updatedAt).toBeTruthy();
  });

  it('exitTrip clears activeTripId', () => {
    exitTrip();
    expect(get(activeTripId)).toBeNull();
  });

  it('archiveTrip sets archived and clears active if archived trip was active', () => {
    const id = get(activeTripId)!;
    archiveTrip(id);
    const trip = get(trips).find(t => t.id === id);
    expect(trip?.archived).toBe(true);
    expect(get(activeTripId)).toBeNull();
  });

  it('unarchiveTrip clears archived flag', () => {
    const id = get(activeTripId)!;
    archiveTrip(id);
    unarchiveTrip(id);
    expect(get(trips).find(t => t.id === id)?.archived).toBe(false);
  });

  it('deleteTrip removes trip and clears active if deleted', () => {
    const id = get(activeTripId)!;
    deleteTrip(id);
    expect(get(trips).find(t => t.id === id)).toBeUndefined();
    expect(get(activeTripId)).toBeNull();
  });

  it('updateData modifies active trip data', () => {
    updateData(data => ({
      ...data,
      participants: [{ id: 'p-1', name: 'Alice' }]
    }));
    expect(get(appData).participants).toHaveLength(1);
  });

  it('replaceData replaces active trip data', async () => {
    const newData = makeAppData({
      participants: [{ id: 'p-1', name: 'Solo' }],
      expenses: []
    });
    await replaceData(newData);
    expect(get(appData).participants[0].name).toBe('Solo');
  });

  it('clearAllData resets active trip data', () => {
    updateData(data => ({
      ...data,
      participants: [{ id: 'p-1', name: 'Alice' }]
    }));
    clearAllData();
    expect(get(appData).participants).toHaveLength(0);
  });

  it('importAsNewTrip creates trip from AppData', () => {
    const data = makeAppData();
    importAsNewTrip('Imported', data, 'From CSV');
    expect(get(activeTrip)?.name).toBe('Imported');
    expect(get(trips).length).toBeGreaterThanOrEqual(2);
  });

  it('duplicateTrip creates copy with new name', async () => {
    const id = get(activeTripId)!;
    updateData(data => ({
      ...data,
      participants: [{ id: 'p-1', name: 'Alice' }]
    }));
    await duplicateTrip(id);
    const copies = get(trips).filter(t => t.name.includes('(Copy)'));
    expect(copies).toHaveLength(1);
    expect(copies[0].id).not.toBe(id);
  });

  it('getSnapshot returns active trip data', () => {
    updateData(data => ({
      ...data,
      settlementCurrency: 'EUR'
    }));
    expect(getSnapshot().settlementCurrency).toBe('EUR');
  });

  it('getFullSnapshot returns entire app state', () => {
    const snapshot = getFullSnapshot();
    expect(snapshot.trips.length).toBeGreaterThan(0);
    expect(snapshot).toHaveProperty('activeTripId');
  });

  it('replaceAllData replaces entire state', async () => {
    const state = {
      trips: [{
        id: 't-new',
        name: 'Backup',
        description: '',
        archived: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        data: makeAppData()
      }],
      activeTripId: 't-new'
    };
    await replaceAllData(state);
    expect(get(trips)).toHaveLength(1);
    expect(get(activeTripId)).toBe('t-new');
  });

  it('replaceAllData batches image ID lookups into a single call', async () => {
    const { existingReceiptImageIds } = await import('../services/imageStore');
    (existingReceiptImageIds as ReturnType<typeof vi.fn>).mockClear();

    const state = {
      trips: [
        {
          id: 't-a',
          name: 'Trip A',
          description: '',
          archived: false,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          data: makeAppData({ expenses: [makeExpense({ receiptImageId: 'img-a' })] })
        },
        {
          id: 't-b',
          name: 'Trip B',
          description: '',
          archived: false,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          data: makeAppData({ expenses: [makeExpense({ receiptImageId: 'img-b' })] })
        }
      ],
      activeTripId: 't-a'
    };
    await replaceAllData(state);
    expect(existingReceiptImageIds).toHaveBeenCalledTimes(1);
    expect(existingReceiptImageIds).toHaveBeenCalledWith(['img-a', 'img-b']);
  });

  it('appData returns empty defaults when no active trip', () => {
    exitTrip();
    expect(get(appData)).toEqual({
      participants: [],
      currencies: [],
      expenses: [],
      exchangeRates: {},
      settlementCurrency: ''
    });
  });

  it('effectiveSettlementCurrency falls back to first currency', () => {
    updateData(data => ({
      ...data,
      currencies: [{ code: 'EUR', symbol: '€' }],
      settlementCurrency: ''
    }));
    expect(get(effectiveSettlementCurrency)).toBe('EUR');
  });

  it('strips receipt image ids on import', () => {
    const data = makeAppData({
      expenses: [makeExpense({ receiptImageId: 'img-1' })]
    });
    importAsNewTrip('With receipt', data);
    const expense = get(appData).expenses[0];
    expect(expense.receiptImageId).toBeUndefined();
  });
});

describe('data store migration', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('migrates v1 single-trip data from old storage key', async () => {
    localStorage.clear();
    const oldData = makeAppData({
      participants: [{ id: 'p-1', name: 'Alice' }],
      expenses: []
    });
    localStorage.setItem('trip-expense-tracker-data', JSON.stringify(oldData));

    vi.resetModules();
    vi.doMock('../services/imageStore', () => ({
      deleteReceiptImages: vi.fn().mockResolvedValue(undefined),
      duplicateReceiptImages: vi.fn().mockResolvedValue(undefined),
      existingReceiptImageIds: vi.fn().mockResolvedValue(new Set())
    }));

    const mod = await import('./data');
    const state = mod.getFullSnapshot();
    expect(state.trips).toHaveLength(1);
    expect(state.trips[0].name).toBe('My Trip');
    expect(state.activeTripId).toBe(state.trips[0].id);
    expect(localStorage.getItem('trip-expense-tracker-data')).toBeNull();
  });
});
