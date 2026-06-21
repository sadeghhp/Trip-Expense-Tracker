import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { resetFactoryCounter } from './factories';

let uuidCounter = 0;
const deterministicUUID = () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`;
vi.stubGlobal('crypto', { ...crypto, randomUUID: deterministicUUID });

if (!HTMLElement.prototype.animate) {
  HTMLElement.prototype.animate = vi.fn(() => ({
    finished: Promise.resolve(),
    cancel: vi.fn(),
    play: vi.fn(),
    pause: vi.fn()
  })) as unknown as typeof HTMLElement.prototype.animate;
}

const originalCreateElement = document.createElement.bind(document);
document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
  const el = originalCreateElement(tagName, options);
  if (tagName.toLowerCase() === 'canvas') {
    const canvas = el as HTMLCanvasElement;
    canvas.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => new ImageData(1, 1))
    })) as unknown as typeof canvas.getContext;
    canvas.toBlob = vi.fn((cb: BlobCallback) => {
      cb(new Blob(['test'], { type: 'image/jpeg' }));
    }) as typeof canvas.toBlob;
  }
  return el;
}) as typeof document.createElement;

afterEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
  resetFactoryCounter();
});
