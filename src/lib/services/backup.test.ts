/**
 * Backup fidelity tests (H5): a "full backup" must actually carry receipt
 * images, and a restore must never strip references silently.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { exportMock, importMock } = vi.hoisted(() => ({
  exportMock: vi.fn(),
  importMock: vi.fn()
}));

vi.mock('./imageStore', () => ({
  exportReceiptImages: exportMock,
  importReceiptImages: importMock
}));

import {
  createFullBackup,
  inspectBackup,
  restoreBackupImages,
  collectReferencedImageIds,
  BACKUP_FORMAT,
  BACKUP_VERSION
} from './backup';
import type { AppState } from '../types';
import { makeTrip, makeAppData, makeExpense } from '../../test/factories';

function stateWithImages(imageIds: string[]): AppState {
  const trip = makeTrip({
    id: 'trip-1',
    data: makeAppData({
      expenses: imageIds.map((id, i) =>
        makeExpense({ id: `e-${i}`, receiptImageId: id, paidBy: 'p-1' })
      )
    })
  });
  return { trips: [trip], activeTripId: 'trip-1' };
}

describe('collectReferencedImageIds', () => {
  it('collects unique ids across trips', () => {
    const state = stateWithImages(['img-1', 'img-2', 'img-1']);
    expect(collectReferencedImageIds(state).sort()).toEqual(['img-1', 'img-2']);
  });

  it('returns nothing when no expense has a receipt', () => {
    expect(collectReferencedImageIds(stateWithImages([]))).toEqual([]);
  });
});

describe('createFullBackup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('embeds the referenced receipt images', async () => {
    exportMock.mockResolvedValueOnce([
      { id: 'img-1', fullImage: 'data:image/jpeg;base64,AAA', thumbnail: 'data:image/jpeg;base64,BBB', createdAt: 1 }
    ]);

    const backup = await createFullBackup(stateWithImages(['img-1']));

    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.images).toHaveLength(1);
    expect(exportMock).toHaveBeenCalledWith(['img-1']);
  });

  it('produces a valid backup for a state with no images', async () => {
    exportMock.mockResolvedValueOnce([]);
    const backup = await createFullBackup(stateWithImages([]));
    expect(backup.images).toEqual([]);
    expect(backup.state.trips).toHaveLength(1);
  });
});

describe('inspectBackup', () => {
  const image = (id: string) => ({
    id,
    fullImage: 'data:image/jpeg;base64,AAA',
    thumbnail: 'data:image/jpeg;base64,BBB',
    createdAt: 1
  });

  it('recognises a versioned backup and reports its images', () => {
    const state = stateWithImages(['img-1']);
    const inspection = inspectBackup({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: '2024-06-15T00:00:00.000Z',
      state,
      images: [image('img-1')]
    });

    expect(inspection.kind).toBe('versioned');
    expect(inspection.referencedImageCount).toBe(1);
    expect(inspection.includedImageCount).toBe(1);
    expect(inspection.missingImageIds).toEqual([]);
  });

  it('flags referenced images the file does not carry', () => {
    const inspection = inspectBackup({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: '2024-06-15T00:00:00.000Z',
      state: stateWithImages(['img-1', 'img-2']),
      images: [image('img-1')]
    });

    expect(inspection.missingImageIds).toEqual(['img-2']);
    expect(inspection.includedImageCount).toBe(1);
  });

  it('classifies a legacy backup and reports every image as missing', () => {
    // Legacy backups are raw AppState with no images at all: the user must be
    // told before the destructive replace, not after.
    const inspection = inspectBackup(stateWithImages(['img-1', 'img-2']));

    expect(inspection.kind).toBe('legacy');
    expect(inspection.referencedImageCount).toBe(2);
    expect(inspection.includedImageCount).toBe(0);
    expect(inspection.missingImageIds.sort()).toEqual(['img-1', 'img-2']);
  });

  it('accepts a legacy backup with no images without warning', () => {
    const inspection = inspectBackup(stateWithImages([]));
    expect(inspection.kind).toBe('legacy');
    expect(inspection.missingImageIds).toEqual([]);
  });

  it('rejects malformed input without throwing', () => {
    expect(inspectBackup(null).kind).toBe('invalid');
    expect(inspectBackup('nonsense').kind).toBe('invalid');
    expect(inspectBackup({ nope: true }).kind).toBe('invalid');
    expect(inspectBackup({ trips: 'not-an-array' }).kind).toBe('invalid');
  });

  it('ignores malformed image entries rather than trusting them', () => {
    const inspection = inspectBackup({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: '2024-06-15T00:00:00.000Z',
      state: stateWithImages(['img-1']),
      images: [{ id: 'img-1', fullImage: 'javascript:alert(1)', thumbnail: 'x' }]
    });
    expect(inspection.images).toHaveLength(0);
    expect(inspection.missingImageIds).toEqual(['img-1']);
  });

  it('does not mutate or replace state during inspection', () => {
    const inspection = inspectBackup(stateWithImages(['img-1']));
    expect(inspection.state?.trips).toHaveLength(1);
    expect(importMock).not.toHaveBeenCalled();
  });
});

describe('restoreBackupImages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restores images and reports the outcome', async () => {
    importMock.mockResolvedValueOnce({ restored: ['img-1'], failed: [] });

    const inspection = inspectBackup({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: '2024-06-15T00:00:00.000Z',
      state: stateWithImages(['img-1']),
      images: [
        { id: 'img-1', fullImage: 'data:image/jpeg;base64,AAA', thumbnail: 'data:image/jpeg;base64,BBB', createdAt: 1 }
      ]
    });

    const result = await restoreBackupImages(inspection);
    expect(result.restoredImages).toBe(1);
    expect(result.failedImages).toEqual([]);
    expect(result.missingImages).toEqual([]);
  });

  it('reports failures and missing images explicitly', async () => {
    importMock.mockResolvedValueOnce({ restored: [], failed: ['img-1'] });

    const inspection = inspectBackup({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: '2024-06-15T00:00:00.000Z',
      state: stateWithImages(['img-1', 'img-2']),
      images: [
        { id: 'img-1', fullImage: 'data:image/jpeg;base64,AAA', thumbnail: 'data:image/jpeg;base64,BBB', createdAt: 1 }
      ]
    });

    const result = await restoreBackupImages(inspection);
    expect(result.failedImages).toEqual(['img-1']);
    expect(result.missingImages).toEqual(['img-2']);
  });

  it('refuses to restore from an invalid inspection', async () => {
    await expect(restoreBackupImages(inspectBackup(null))).rejects.toThrow();
  });
});

describe('backup round trip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a created backup inspects as complete with no missing images', async () => {
    const serialized = [
      { id: 'img-1', fullImage: 'data:image/jpeg;base64,AAA', thumbnail: 'data:image/jpeg;base64,BBB', createdAt: 1 }
    ];
    exportMock.mockResolvedValueOnce(serialized);

    const backup = await createFullBackup(stateWithImages(['img-1']));
    const roundTripped = JSON.parse(JSON.stringify(backup));
    const inspection = inspectBackup(roundTripped);

    expect(inspection.kind).toBe('versioned');
    expect(inspection.missingImageIds).toEqual([]);
    expect(inspection.state?.trips[0].data.expenses[0].receiptImageId).toBe('img-1');
  });
});
