import { writable, get } from 'svelte/store';
import type { AISettings } from '../types';

const STORAGE_KEY = 'trip-expense-tracker-ai-settings';

function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        apiKey: parsed.apiKey ?? '',
        model: parsed.model ?? '',
        customPrompt: parsed.customPrompt ?? ''
      };
    }
  } catch {}
  return { apiKey: '', model: '', customPrompt: '' };
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

export async function testConnection(): Promise<boolean> {
  const settings = getAISettings();
  if (!settings.apiKey || !settings.model) return false;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`
      }
    });
    return response.ok;
  } catch {
    return false;
  }
}
