import type { AppData, Expense } from '../types';

export interface ValidationError {
  key: string;
  params?: Record<string, string | number>;
}

export function validateParticipantName(
  name: string,
  existingNames: string[],
  excludeId?: string,
  participants?: { id: string; name: string }[]
): ValidationError | null {
  const trimmed = name.trim();
  if (!trimmed) return { key: 'validation.nameRequired' };

  const nameLower = trimmed.toLowerCase();
  const names = excludeId && participants
    ? participants.filter(p => p.id !== excludeId).map(p => p.name.toLowerCase())
    : existingNames.map(n => n.toLowerCase());

  if (names.includes(nameLower)) {
    return { key: 'validation.participantExists' };
  }
  return null;
}

export function isParticipantUsed(id: string, expenses: Expense[]): boolean {
  return expenses.some(
    e => e.paidBy === id || e.beneficiaries.some(b => b.participantId === id)
  );
}

export function validateCurrencyCode(
  code: string,
  existingCodes: string[],
  excludeCode?: string
): ValidationError | null {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { key: 'validation.codeAndSymbolRequired' };

  const codes = excludeCode
    ? existingCodes.filter(c => c !== excludeCode)
    : existingCodes;

  if (codes.includes(trimmed)) {
    return { key: 'validation.currencyExists' };
  }
  return null;
}

export function isCurrencyUsed(code: string, expenses: Expense[]): boolean {
  return expenses.some(e => e.currencyCode === code);
}

export function validateExpense(
  expense: Partial<Expense>,
  data: AppData
): ValidationError | null {
  if (!expense.date || !expense.description?.trim() || !expense.currencyCode || !expense.paidBy) {
    return { key: 'validation.allFieldsRequired' };
  }

  const amount = Number(expense.amount);
  if (!amount || amount <= 0 || isNaN(amount)) {
    return { key: 'validation.amountPositive' };
  }

  if (!expense.beneficiaries || expense.beneficiaries.length === 0) {
    return { key: 'validation.selectBeneficiary' };
  }

  if (expense.splitType === 'custom') {
    for (const b of expense.beneficiaries) {
      if ((b.customAmount ?? 0) < 0) return { key: 'validation.customNegative' };
    }
    const sum = expense.beneficiaries.reduce((s, b) => s + (b.customAmount ?? 0), 0);
    if (Math.abs(sum - amount) >= 0.01) {
      return { key: 'validation.customSumMismatch', params: { amount: amount.toFixed(2), sum: sum.toFixed(2) } };
    }
  }

  if (expense.splitType === 'percentage') {
    for (const b of expense.beneficiaries) {
      if ((b.customPercentage ?? 0) < 0) return { key: 'validation.percentageNegative' };
    }
    const sum = expense.beneficiaries.reduce((s, b) => s + (b.customPercentage ?? 0), 0);
    if (Math.abs(sum - 100) >= 0.01) {
      return { key: 'validation.percentageSumMismatch', params: { sum: sum.toFixed(2) } };
    }
  }

  return null;
}

export function validateSettlement(
  settlementCurrency: string,
  currencies: { code: string }[],
  exchangeRates: Record<string, number>
): ValidationError | null {
  if (!settlementCurrency) return { key: 'validation.selectSettlementCurrency' };

  for (const c of currencies) {
    if (c.code === settlementCurrency) continue;
    const rate = exchangeRates[c.code];
    if (!rate || rate <= 0) {
      return { key: 'validation.invalidExchangeRate', params: { code: c.code } };
    }
  }
  return null;
}
