import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateId } from './id';

describe('generateId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns UUID format when crypto.randomUUID is available', () => {
    const id = generateId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('returns fallback when crypto.randomUUID is not available', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    const id = generateId();
    Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('produces different ids on consecutive calls', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('always returns non-empty string', () => {
    expect(generateId().length).toBeGreaterThan(0);
  });
});
