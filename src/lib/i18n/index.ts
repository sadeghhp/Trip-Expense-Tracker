import { writable, derived } from 'svelte/store';
import en from './en.json';
import fa from './fa.json';

export type Locale = 'en' | 'fa';
export type Direction = 'ltr' | 'rtl';

const RTL_LOCALES: Set<Locale> = new Set(['fa']);
const translations: Record<Locale, Record<string, any>> = { en, fa };

const VAZIRMATN_URL = 'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&display=swap';

function applyDirection(loc: Locale): void {
  if (typeof document === 'undefined') return;
  const dir = RTL_LOCALES.has(loc) ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = loc;

  if (dir === 'rtl' && !document.getElementById('vazirmatn-font')) {
    const link = document.createElement('link');
    link.id = 'vazirmatn-font';
    link.rel = 'stylesheet';
    link.href = VAZIRMATN_URL;
    document.head.appendChild(link);
  }
}

function loadInitialLocale(): Locale {
  if (typeof localStorage === 'undefined') return 'en';
  try {
    const raw = localStorage.getItem('trip-expense-tracker-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.locale === 'fa') return 'fa';
    }
    const legacy = localStorage.getItem('trip-expense-tracker-locale');
    if (legacy === 'fa') return 'fa';
  } catch {}
  return 'en';
}

const initialLocale = loadInitialLocale();
if (typeof document !== 'undefined') {
  applyDirection(initialLocale);
}

export const locale = writable<Locale>(initialLocale);

locale.subscribe((l) => {
  applyDirection(l);
});

export const dir = derived(locale, ($locale): Direction =>
  RTL_LOCALES.has($locale) ? 'rtl' : 'ltr'
);

export const isRtl = derived(dir, ($dir) => $dir === 'rtl');

function resolve(obj: any, path: string): string | undefined {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

export const t = derived(locale, ($locale) => {
  return (key: string, params?: Record<string, string | number>): string => {
    let text = resolve(translations[$locale], key) ?? resolve(translations['en'], key) ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    return text;
  };
});

export function setLocale(l: Locale): void {
  locale.set(l);
}
