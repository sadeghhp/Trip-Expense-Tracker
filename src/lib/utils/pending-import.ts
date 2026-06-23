import type { Expense, Participant, Currency, PendingImportItem } from '../types';

export function buildExpenseFromPendingItem(
  item: PendingImportItem,
  participants: Participant[],
  currencies: Currency[]
): Expense {
  const payerId = item.payerName
    ? participants.find(p => p.name.toLowerCase() === item.payerName!.toLowerCase())?.id
    : undefined;

  return {
    id: '',
    date: item.date ?? '',
    description: item.description ?? '',
    currencyCode: item.currencyCode ?? currencies[0]?.code ?? '',
    amount: item.amount ?? 0,
    paidBy: payerId ?? participants[0]?.id ?? '',
    splitType: 'equal',
    beneficiaries: participants.map(p => ({
      participantId: p.id,
      customAmount: null,
      customPercentage: null
    }))
  };
}
