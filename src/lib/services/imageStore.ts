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
