import type { CurrencyBalances, Participant, UnifiedBalance, SettlementTransaction } from '../types';

/**
 * Recalculates exchange rates when the settlement currency changes.
 * Rate semantics: exchangeRates[code] = units of `code` per 1 settlement unit.
 * Uses the pivot rate (old rate of the new settlement) to derive all cross-rates.
 * Returns the old rates unchanged if the pivot rate is unavailable.
 */
export function recalculateExchangeRates(
  oldRates: Record<string, number>,
  oldSettlement: string,
  newSettlement: string
): Record<string, number> {
  if (oldSettlement === newSettlement || !oldSettlement || !newSettlement) return oldRates;

  const pivotRate = oldRates[newSettlement];
  if (!pivotRate || pivotRate <= 0) return oldRates;

  const newRates: Record<string, number> = {};
  const round = (n: number) => parseFloat(n.toPrecision(10));

  for (const [code, rate] of Object.entries(oldRates)) {
    if (code === newSettlement) continue;
    if (rate > 0) {
      newRates[code] = round(rate / pivotRate);
    }
  }

  newRates[oldSettlement] = round(1 / pivotRate);

  return newRates;
}

export function computeUnifiedBalances(
  balances: CurrencyBalances,
  participants: Participant[],
  settlementCurrency: string,
  exchangeRates: Record<string, number>
): UnifiedBalance[] {
  const unified: Record<string, number> = {};
  for (const p of participants) {
    unified[p.id] = 0;
  }

  for (const [code, participantBalances] of Object.entries(balances)) {
    if (code !== settlementCurrency && (!exchangeRates[code] || exchangeRates[code] <= 0)) {
      continue;
    }
    const conversionRate = code === settlementCurrency ? 1 : 1 / exchangeRates[code];

    for (const [pid, entry] of Object.entries(participantBalances)) {
      if (unified[pid] === undefined) unified[pid] = 0;
      unified[pid] += entry.net * conversionRate;
    }
  }

  return participants.map(p => ({
    id: p.id,
    name: p.name,
    balance: Math.round((unified[p.id] ?? 0) * 100) / 100
  }));
}

export function computeSettlementTransactions(
  unifiedBalances: UnifiedBalance[]
): SettlementTransaction[] {
  const transactions: SettlementTransaction[] = [];

  let creditors: { id: string; name: string; amount: number }[] = [];
  let debtors: { id: string; name: string; amount: number }[] = [];

  for (const ub of unifiedBalances) {
    if (ub.balance > 0.005) {
      creditors.push({ id: ub.id, name: ub.name, amount: Math.round(ub.balance * 100) / 100 });
    } else if (ub.balance < -0.005) {
      debtors.push({ id: ub.id, name: ub.name, amount: Math.round(-ub.balance * 100) / 100 });
    }
  }

  // Pass 1: Exact matches (iterate from last to first)
  for (let di = debtors.length - 1; di >= 0; di--) {
    let matched = false;
    for (let ci = creditors.length - 1; ci >= 0; ci--) {
      if (Math.abs(debtors[di].amount - creditors[ci].amount) < 0.005) {
        transactions.push({
          from: debtors[di].id,
          fromName: debtors[di].name,
          to: creditors[ci].id,
          toName: creditors[ci].name,
          amount: debtors[di].amount
        });
        creditors.splice(ci, 1);
        matched = true;
        break;
      }
    }
    if (matched) {
      debtors.splice(di, 1);
    }
  }

  // Pass 2: Greedy largest-first
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  while (creditors.length > 0 && debtors.length > 0) {
    const c = creditors[0];
    const d = debtors[0];
    const transfer = Math.round(Math.min(c.amount, d.amount) * 100) / 100;

    transactions.push({
      from: d.id,
      fromName: d.name,
      to: c.id,
      toName: c.name,
      amount: transfer
    });

    c.amount = Math.round((c.amount - transfer) * 100) / 100;
    d.amount = Math.round((d.amount - transfer) * 100) / 100;

    if (c.amount < 0.005) creditors.shift();
    if (d.amount < 0.005) debtors.shift();
  }

  return transactions;
}
