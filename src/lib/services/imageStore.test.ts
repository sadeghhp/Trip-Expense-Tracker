import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockStore = new Map<string, unknown>();
const mockDb = {
  put: vi.fn(async (_store: string, record: { id: string }) => {
    mockStore.set(record.id, record);
  }),
  get: vi.fn(async (_store: string, id: string) => mockStore.get(id)),
  delete: vi.fn(async (_store: string, id: string) => {
    mockStore.delete(id);
  }),
  transaction: vi.fn((_store: string, _mode: string) => {
    const tx = {
      store: {
        delete: vi.fn(async (id: string) => {
          mockStore.delete(id);
        }),
        get: vi.fn(async (id: string) => mockStore.get(id)),
        getKey: vi.fn(async (id: string) => (mockStore.has(id) ? id : undefined)),
        put: vi.fn(async (record: { id: string }) => {
          mockStore.set(record.id, record);
        })
      },
      done: Promise.resolve()
    };
    return tx;
  })
};

vi.mock('idb', () => ({
  openDB: vi.fn(async () => mockDb)
}));

import {
  saveReceiptImage,
  getReceiptThumbnail,
  getReceiptImage,
  deleteReceiptImage,
  deleteReceiptImages,
  existingReceiptImageIds,
  duplicateReceiptImages
} from './imageStore';

const dataUrl = 'data:image/jpeg;base64,' + btoa('fake-image-data');

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 400;
  height = 300;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe('imageStore', () => {
  beforeEach(() => {
    mockStore.clear();
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    vi.stubGlobal('Image', MockImage);
  });

  it('saves image with full and thumbnail records', async () => {
    await saveReceiptImage('img-1', dataUrl);
    expect(mockDb.put).toHaveBeenCalled();
    const record = mockStore.get('img-1') as { fullImage: Blob; thumbnail: Blob };
    expect(record).toBeDefined();
    expect(record.fullImage).toBeInstanceOf(Blob);
    expect(record.thumbnail).toBeInstanceOf(Blob);
  });

  it('retrieves thumbnail URL', async () => {
    await saveReceiptImage('img-1', dataUrl);
    const url = await getReceiptThumbnail('img-1');
    expect(url).toBe('blob:mock-url');
  });

  it('retrieves full image URL', async () => {
    await saveReceiptImage('img-1', dataUrl);
    const url = await getReceiptImage('img-1');
    expect(url).toBe('blob:mock-url');
  });

  it('returns null for missing image', async () => {
    expect(await getReceiptImage('missing')).toBeNull();
    expect(await getReceiptThumbnail('missing')).toBeNull();
  });

  it('deletes image record', async () => {
    await saveReceiptImage('img-1', dataUrl);
    await deleteReceiptImage('img-1');
    expect(mockStore.has('img-1')).toBe(false);
  });

  it('handles batch delete with empty array', async () => {
    await expect(deleteReceiptImages([])).resolves.toBeUndefined();
  });

  it('batch deletes multiple images', async () => {
    await saveReceiptImage('img-1', dataUrl);
    await saveReceiptImage('img-2', dataUrl);
    await deleteReceiptImages(['img-1', 'img-2']);
    expect(mockStore.size).toBe(0);
  });

  it('existingReceiptImageIds returns only existing ids', async () => {
    await saveReceiptImage('img-1', dataUrl);
    const found = await existingReceiptImageIds(['img-1', 'img-missing']);
    expect(found).toEqual(new Set(['img-1']));
  });

  it('duplicateReceiptImages creates copies under new ids', async () => {
    await saveReceiptImage('old-1', dataUrl);
    const map = new Map([['old-1', 'new-1']]);
    await duplicateReceiptImages(map);
    expect(mockStore.has('new-1')).toBe(true);
    const copy = mockStore.get('new-1') as { id: string };
    expect(copy.id).toBe('new-1');
  });

  it('throws when duplicating missing source image', async () => {
    const map = new Map([['missing', 'new-1']]);
    await expect(duplicateReceiptImages(map)).rejects.toThrow('Missing receipt images');
  });
});
