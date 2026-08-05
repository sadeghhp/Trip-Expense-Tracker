/**
 * Versioned full backup: app state plus the receipt images that state refers to.
 *
 * The previous "full backup" serialized localStorage only. Receipt blobs live
 * in IndexedDB, so every backup silently omitted them and every restore
 * silently stripped the now-dangling references.
 */
import type { AppState } from '../types';
import { normalizeAppState } from '../utils/normalize';
import {
  exportReceiptImages,
  importReceiptImages,
  type SerializedReceiptImage
} from './imageStore';

export const BACKUP_FORMAT = 'trip-expense-tracker-backup';
export const BACKUP_VERSION = 2;

export interface BackupFileV2 {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  state: AppState;
  images: SerializedReceiptImage[];
}

export function collectReferencedImageIds(state: AppState): string[] {
  const ids = new Set<string>();
  for (const trip of state.trips) {
    for (const expense of trip.data.expenses) {
      if (expense.receiptImageId) ids.add(expense.receiptImageId);
    }
  }
  return [...ids];
}

/** Builds a complete backup payload, embedding every referenced image. */
export async function createFullBackup(state: AppState): Promise<BackupFileV2> {
  const referenced = collectReferencedImageIds(state);
  const images = await exportReceiptImages(referenced);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    state,
    images
  };
}

export type BackupKind = 'versioned' | 'legacy' | 'invalid';

export interface BackupInspection {
  kind: BackupKind;
  /** Parsed app state, present unless `kind === 'invalid'`. */
  state: AppState | null;
  images: SerializedReceiptImage[];
  tripCount: number;
  /** Images the state refers to. */
  referencedImageCount: number;
  /** Referenced images the file actually carries. */
  includedImageCount: number;
  /** Referenced images the file does NOT carry — these would be lost. */
  missingImageIds: string[];
  error?: string;
}

function isSerializedImage(value: unknown): value is SerializedReceiptImage {
  if (!value || typeof value !== 'object') return false;
  const image = value as Record<string, unknown>;
  return (
    typeof image.id === 'string' &&
    typeof image.fullImage === 'string' &&
    image.fullImage.startsWith('data:') &&
    typeof image.thumbnail === 'string' &&
    image.thumbnail.startsWith('data:')
  );
}

/**
 * Validates and classifies a parsed backup file without touching any state, so
 * the user can be told exactly what a restore would do — including which
 * receipt images are missing — before anything destructive happens.
 */
export function inspectBackup(parsed: unknown): BackupInspection {
  const empty: BackupInspection = {
    kind: 'invalid',
    state: null,
    images: [],
    tripCount: 0,
    referencedImageCount: 0,
    includedImageCount: 0,
    missingImageIds: []
  };

  if (!parsed || typeof parsed !== 'object') {
    return { ...empty, error: 'validation.invalidJsonObject' };
  }

  const candidate = parsed as Record<string, unknown>;
  const isVersioned =
    candidate.format === BACKUP_FORMAT && typeof candidate.version === 'number' && !!candidate.state;

  const rawState = isVersioned ? candidate.state : candidate;
  if (!rawState || typeof rawState !== 'object' || !Array.isArray((rawState as AppState).trips)) {
    return { ...empty, error: 'validation.missingTrips' };
  }

  const state = normalizeAppState(rawState);
  const images = isVersioned && Array.isArray(candidate.images)
    ? candidate.images.filter(isSerializedImage)
    : [];

  const referenced = collectReferencedImageIds(state);
  const includedIds = new Set(images.map(i => i.id));
  const missingImageIds = referenced.filter(id => !includedIds.has(id));

  return {
    kind: isVersioned ? 'versioned' : 'legacy',
    state,
    images,
    tripCount: state.trips.length,
    referencedImageCount: referenced.length,
    includedImageCount: referenced.filter(id => includedIds.has(id)).length,
    missingImageIds
  };
}

export interface RestoreResult {
  restoredImages: number;
  failedImages: string[];
  /** Referenced images that were not in the backup and remain unavailable. */
  missingImages: string[];
}

/**
 * Writes the backup's images into IndexedDB. Runs before app state is replaced
 * so that references resolve and the store's orphan cleanup does not strip them.
 */
export async function restoreBackupImages(inspection: BackupInspection): Promise<RestoreResult> {
  if (!inspection.state) {
    throw new Error('validation.invalidJsonObject');
  }
  const { restored, failed } = await importReceiptImages(inspection.images);
  return {
    restoredImages: restored.length,
    failedImages: failed,
    missingImages: inspection.missingImageIds
  };
}
