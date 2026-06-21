import type { AppData } from '../types';

export function normalizeData(raw: any): AppData {
  const participants = Array.isArray(raw?.participants) ? raw.participants : [];
  const currencies = Array.isArray(raw?.currencies) ? raw.currencies : [];
  let expenses = Array.isArray(raw?.expenses) ? raw.expenses : [];
  const exchangeRates = (raw?.exchangeRates && typeof raw.exchangeRates === 'object' && !Array.isArray(raw.exchangeRates))
    ? raw.exchangeRates : {};
  let settlementCurrency = typeof raw?.settlementCurrency === 'string' ? raw.settlementCurrency : '';

  const validParticipants = participants.filter(
    (p: any) => typeof p?.id === 'string' && typeof p?.name === 'string'
  );

  const validCurrencies = currencies.filter(
    (c: any) => typeof c?.code === 'string' && typeof c?.symbol === 'string'
  );

  const participantIds = new Set(validParticipants.map((p: any) => p.id));
  const currencyCodes = new Set(validCurrencies.map((c: any) => c.code));

  // First filter: must have id and beneficiaries array
  expenses = expenses.filter(
    (e: any) => typeof e?.id === 'string' && Array.isArray(e?.beneficiaries)
  );

  // Filter beneficiaries and normalize splitType
  expenses = expenses.map((e: any) => {
    const filteredBeneficiaries = e.beneficiaries.filter(
      (b: any) => typeof b?.participantId === 'string' && participantIds.has(b.participantId)
    );
    const splitType = ['equal', 'custom', 'percentage'].includes(e.splitType) ? e.splitType : 'equal';
    return { ...e, beneficiaries: filteredBeneficiaries, splitType };
  });

  // Second filter: referential integrity
  expenses = expenses.filter(
    (e: any) =>
      participantIds.has(e.paidBy) &&
      currencyCodes.has(e.currencyCode) &&
      e.beneficiaries.length > 0
  );

  // Clean exchange rates
  const cleanedRates: Record<string, number> = {};
  for (const [code, rate] of Object.entries(exchangeRates)) {
    if (currencyCodes.has(code) && typeof rate === 'number' && rate > 0) {
      cleanedRates[code] = rate;
    }
  }

  // Clean settlement currency
  if (!currencyCodes.has(settlementCurrency)) {
    settlementCurrency = '';
  }

  return {
    participants: validParticipants,
    currencies: validCurrencies,
    expenses,
    exchangeRates: cleanedRates,
    settlementCurrency
  };
}
