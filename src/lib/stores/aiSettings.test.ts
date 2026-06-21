import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { getAISettings, updateAISettings, getChatCompletionsUrl, testConnection, aiSettings } from './aiSettings';

describe('aiSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    updateAISettings({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'test-model',
      customPrompt: ''
    });
  });

  it('getChatCompletionsUrl appends path', () => {
    expect(getChatCompletionsUrl('https://api.example.com/v1')).toBe(
      'https://api.example.com/v1/chat/completions'
    );
  });

  it('getChatCompletionsUrl strips trailing slash', () => {
    expect(getChatCompletionsUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/chat/completions'
    );
  });

  it('getChatCompletionsUrl throws for invalid URL', () => {
    expect(() => getChatCompletionsUrl('not-a-url')).toThrow('receipt.errorInvalidBaseUrl');
  });

  it('getAISettings returns current settings', () => {
    const settings = getAISettings();
    expect(settings.apiKey).toBe('test-key');
    expect(settings.model).toBe('test-model');
  });

  it('persists settings to localStorage', () => {
    updateAISettings({ model: 'new-model' });
    const raw = localStorage.getItem('trip-expense-tracker-ai-settings');
    expect(JSON.parse(raw!).model).toBe('new-model');
  });

  it('testConnection returns false when config incomplete', async () => {
    updateAISettings({ apiKey: '' });
    expect(await testConnection()).toBe(false);
  });

  it('testConnection returns true on successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true } as Response);
    expect(await testConnection()).toBe(true);
  });

  it('testConnection returns false on failed response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    expect(await testConnection()).toBe(false);
  });

  it('loads defaults when localStorage empty', () => {
    localStorage.clear();
    vi.resetModules();
    return import('./aiSettings').then(mod => {
      const settings = get(mod.aiSettings);
      expect(settings.baseUrl).toContain('openrouter.ai');
      expect(settings.apiKey).toBe('');
    });
  });
});
