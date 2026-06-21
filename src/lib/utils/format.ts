import type { Participant, Currency } from '../types';

export function formatAmount(num: number): string {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function getParticipantName(id: string, participants: Participant[]): string {
  return participants.find(p => p.id === id)?.name ?? 'Unknown';
}

export function getCurrencySymbol(code: string, currencies: Currency[]): string {
  return currencies.find(c => c.code === code)?.symbol ?? code;
}
