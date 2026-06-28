import { get } from 'svelte/store';
import type { Participant, Currency } from '../types';
import { locale } from '../i18n';
import { settings } from '../stores/settings';

const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  fa: 'fa-IR'
};

export function formatAmount(num: number): string {
  const appLocale = LOCALE_MAP[get(locale)] ?? 'en-US';
  const decimals = get(settings).showDecimals;
  return num.toLocaleString(appLocale, {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
    useGrouping: true
  });
}

export function getParticipantName(id: string, participants: Participant[]): string {
  return participants.find(p => p.id === id)?.name ?? 'Unknown';
}

export function getCurrencySymbol(code: string, currencies: Currency[]): string {
  return currencies.find(c => c.code === code)?.symbol ?? code;
}
