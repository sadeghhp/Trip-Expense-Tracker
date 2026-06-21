import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { toasts, showToast } from './toast';

describe('toast store', () => {
  beforeEach(() => {
    toasts.set([]);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds toast to store', () => {
    showToast('Saved!', 'success');
    const msgs = get(toasts);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ text: 'Saved!', type: 'success' });
  });

  it('removes toast after 3 seconds', () => {
    showToast('Temporary', 'info');
    expect(get(toasts)).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(get(toasts)).toHaveLength(0);
  });

  it('allows multiple toasts', () => {
    showToast('One', 'success');
    showToast('Two', 'error');
    expect(get(toasts)).toHaveLength(2);
  });

  it('defaults to success type', () => {
    showToast('Default type');
    expect(get(toasts)[0].type).toBe('success');
  });
});
