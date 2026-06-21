import type { AppData, Expense } from '../types';

export function validateParticipantName(
  name: string,
  existingNames: string[],
  excludeId?: string,
  participants?: { id: string; name: string }[]
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Name is required.';

  const nameLower = trimmed.toLowerCase();
  const names = excludeId && participants
    ? participants.filter(p => p.id !== excludeId).map(p => p.name.toLowerCase())
    : existingNames.map(n => n.toLowerCase());

  if (names.includes(nameLower)) {
    return 'A participant with this name already exists.';
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
): string | null {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return 'Both code and symbol are required.';

  const codes = excludeCode
    ? existingCodes.filter(c => c !== excludeCode)
    : existingCodes;

  if (codes.includes(trimmed)) {
    return 'A currency with this code already exists.';
  }
  return null;
}

export function isCurrencyUsed(code: string, expenses: Expense[]): boolean {
  return expenses.some(e => e.currencyCode === code);
}

export function validateExpense(
  expense: Partial<Expense>,
  data: AppData
): string | null {
  if (!expense.date || !expense.description?.trim() || !expense.currencyCode || !expense.paidBy) {
    return 'All fields are required.';
  }

  const amount = Number(expense.amount);
  if (!amount || amount <= 0 || isNaN(amount)) {
    return 'Amount must be a positive number.';
  }

  if (!expense.beneficiaries || expense.beneficiaries.length === 0) {
    return 'Select at least one beneficiary.';
  }

  if (expense.splitType === 'custom') {
    for (const b of expense.beneficiaries) {
      if ((b.customAmount ?? 0) < 0) return 'Custom amounts cannot be negative.';
    }
    const sum = expense.beneficiaries.reduce((s, b) => s + (b.customAmount ?? 0), 0);
    if (Math.abs(sum - amount) >= 0.01) {
      return `Custom amounts must sum to ${amount.toFixed(2)}. Current sum: ${sum.toFixed(2)}.`;
    }
  }

  if (expense.splitType === 'percentage') {
    for (const b of expense.beneficiaries) {
      if ((b.customPercentage ?? 0) < 0) return 'Percentages cannot be negative.';
    }
    const sum = expense.beneficiaries.reduce((s, b) => s + (b.customPercentage ?? 0), 0);
    if (Math.abs(sum - 100) >= 0.01) {
      return `Percentages must sum to 100%. Current sum: ${sum.toFixed(2)}%.`;
    }
  }

  return null;
}

export function validateSettlement(
  settlementCurrency: string,
  currencies: { code: string }[],
  exchangeRates: Record<string, number>
): string | null {
  if (!settlementCurrency) return 'Please select a settlement currency.';

  for (const c of currencies) {
    if (c.code === settlementCurrency) continue;
    const rate = exchangeRates[c.code];
    if (!rate || rate <= 0) {
      return `Please enter a valid exchange rate for ${c.code}.`;
    }
  }
  return null;
}
