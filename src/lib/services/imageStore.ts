import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'trip-expense-images';
const STORE_NAME = 'receipts';
const DB_VERSION = 1;

interface ReceiptImageRecord {
  id: string;
  fullImage: Blob;
  thumbnail: Blob;
  createdAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      }
    });
  }
  return dbPromise;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function createThumbnail(dataUrl: string, maxDim = 200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context failed')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Thumbnail blob failed')),
        'image/jpeg',
        0.6
      );
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}

export async function saveReceiptImage(id: string, dataUrl: string): Promise<void> {
  const db = await getDB();
  const fullImage = dataUrlToBlob(dataUrl);
  const thumbnail = await createThumbnail(dataUrl);
  const record: ReceiptImageRecord = { id, fullImage, thumbnail, createdAt: Date.now() };
  await db.put(STORE_NAME, record);
}

export async function getReceiptThumbnail(id: string): Promise<string | null> {
  const db = await getDB();
  const record: ReceiptImageRecord | undefined = await db.get(STORE_NAME, id);
  if (!record) return null;
  return URL.createObjectURL(record.thumbnail);
}

export async function getReceiptImage(id: string): Promise<string | null> {
  const db = await getDB();
  const record: ReceiptImageRecord | undefined = await db.get(STORE_NAME, id);
  if (!record) return null;
  return URL.createObjectURL(record.fullImage);
}

export async function deleteReceiptImage(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

export async function deleteReceiptImages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await Promise.all(ids.map(id => tx.store.delete(id)));
  await tx.done;
}

export async function existingReceiptImageIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const found = new Set<string>();
  for (const id of ids) {
    const key = await tx.store.getKey(id);
    if (key !== undefined) found.add(id);
  }
  await tx.done;
  return found;
}

export interface DuplicateImagesResult {
  /** Source ids that were copied to their new id. */
  copied: string[];
  /** Source ids with no stored blob; the caller must not keep a reference. */
  missing: string[];
}

/**
 * Copies image records under new ids.
 *
 * Reports missing sources instead of throwing: the previous version committed
 * the copies it had made and *then* threw, so the caller discarded the clone
 * while the copied blobs stayed in IndexedDB forever, and any trip with one
 * evicted blob could never be duplicated.
 */
export async function duplicateReceiptImages(idMap: Map<string, string>): Promise<DuplicateImagesResult> {
  const result: DuplicateImagesResult = { copied: [], missing: [] };
  if (idMap.size === 0) return result;

  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const [oldId, newId] of idMap) {
    const record: ReceiptImageRecord | undefined = await tx.store.get(oldId);
    if (record) {
      await tx.store.put({ ...record, id: newId, createdAt: Date.now() });
      result.copied.push(oldId);
    } else {
      result.missing.push(oldId);
    }
  }
  await tx.done;
  return result;
}

export interface SerializedReceiptImage {
  id: string;
  fullImage: string;
  thumbnail: string;
  createdAt: number;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read image blob'));
    reader.readAsDataURL(blob);
  });
}

/** Serializes stored images so a backup file can carry them. */
export async function exportReceiptImages(ids: string[]): Promise<SerializedReceiptImage[]> {
  if (ids.length === 0) return [];
  const db = await getDB();
  const out: SerializedReceiptImage[] = [];
  for (const id of ids) {
    const record: ReceiptImageRecord | undefined = await db.get(STORE_NAME, id);
    if (!record) continue;
    out.push({
      id,
      fullImage: await blobToDataUrl(record.fullImage),
      thumbnail: await blobToDataUrl(record.thumbnail),
      createdAt: record.createdAt ?? Date.now()
    });
  }
  return out;
}

export interface ImportImagesResult {
  restored: string[];
  failed: string[];
}

/** Writes serialized images back into IndexedDB. */
export async function importReceiptImages(
  images: SerializedReceiptImage[]
): Promise<ImportImagesResult> {
  const result: ImportImagesResult = { restored: [], failed: [] };
  if (images.length === 0) return result;

  const db = await getDB();
  for (const image of images) {
    try {
      const record: ReceiptImageRecord = {
        id: image.id,
        fullImage: dataUrlToBlob(image.fullImage),
        thumbnail: dataUrlToBlob(image.thumbnail),
        createdAt: typeof image.createdAt === 'number' ? image.createdAt : Date.now()
      };
      await db.put(STORE_NAME, record);
      result.restored.push(image.id);
    } catch {
      result.failed.push(image.id);
    }
  }
  return result;
}
