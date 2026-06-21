import type { AppData, Expense, Participant, Currency, Trip, Beneficiary } from '$lib/types';

let counter = 0;

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function resetFactoryCounter(): void {
  counter = 0;
}

export function makeParticipant(overrides: Partial<Participant> = {}): Participant {
  return {
    id: nextId('p'),
    name: `Participant ${counter}`,
    ...overrides
  };
}

export function makeCurrency(overrides: Partial<Currency> = {}): Currency {
  return {
    code: 'USD',
    symbol: '$',
    ...overrides
  };
}

export function makeBeneficiary(participantId: string, overrides: Partial<Beneficiary> = {}): Beneficiary {
  return {
    participantId,
    customAmount: null,
    customPercentage: null,
    ...overrides
  };
}

export function makeExpense(overrides: Partial<Expense> = {}): Expense {
  const p1 = overrides.paidBy ?? 'p-1';
  const beneficiaries = overrides.beneficiaries ?? [
    makeBeneficiary(p1),
    makeBeneficiary('p-2')
  ];

  return {
    id: nextId('e'),
    date: '2024-06-15',
    description: 'Test expense',
    currencyCode: 'USD',
    amount: 100,
    paidBy: p1,
    splitType: 'equal',
    beneficiaries,
    ...overrides
  };
}

export function makeAppData(overrides: Partial<AppData> = {}): AppData {
  const p1 = makeParticipant({ id: 'p-1', name: 'Alice' });
  const p2 = makeParticipant({ id: 'p-2', name: 'Bob' });
  const currency = makeCurrency();

  return {
    participants: [p1, p2],
    currencies: [currency],
    expenses: [],
    exchangeRates: {},
    settlementCurrency: 'USD',
    ...overrides
  };
}

export function makeTrip(overrides: Partial<Trip> = {}): Trip {
  const now = '2024-06-15T12:00:00.000Z';
  return {
    id: nextId('trip'),
    name: 'Test Trip',
    description: '',
    archived: false,
    createdAt: now,
    updatedAt: now,
    data: makeAppData(),
    ...overrides
  };
}
