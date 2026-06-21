import { writable, get } from 'svelte/store';
import type { AISettings } from '../types';

const STORAGE_KEY = 'trip-expense-tracker-ai-settings';
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        baseUrl: parsed.baseUrl ?? DEFAULT_BASE_URL,
        apiKey: parsed.apiKey ?? '',
        model: parsed.model ?? '',
        customPrompt: parsed.customPrompt ?? ''
      };
    }
  } catch {}
  return { baseUrl: DEFAULT_BASE_URL, apiKey: '', model: '', customPrompt: '' };
}

const initial = loadSettings();
export const aiSettings = writable<AISettings>(initial);

aiSettings.subscribe((s) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
});

export function getAISettings(): AISettings {
  return get(aiSettings);
}

export function updateAISettings(partial: Partial<AISettings>): void {
  aiSettings.update(s => ({ ...s, ...partial }));
}

export function getChatCompletionsUrl(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Invalid URL scheme');
    }
  } catch {
    throw new Error('receipt.errorInvalidBaseUrl');
  }
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

export async function testConnection(): Promise<boolean> {
  const { baseUrl, apiKey, model } = getAISettings();
  if (!baseUrl || !apiKey || !model) return false;

  try {
    const url = getChatCompletionsUrl(baseUrl);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 1
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}
