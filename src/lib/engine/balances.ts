import type { Expense, CurrencyBalances, BalanceEntry } from '../types';
import { getBeneficiaryShares } from './shares';

export function computeBalances(expenses: Expense[]): CurrencyBalances {
  const balances: CurrencyBalances = {};

  for (const expense of expenses) {
    const { currencyCode, paidBy, amount, beneficiaries } = expense;

    if (!balances[currencyCode]) {
      balances[currencyCode] = {};
    }

    const currBal = balances[currencyCode];

    if (!currBal[paidBy]) {
      currBal[paidBy] = { paid: 0, owed: 0, net: 0 };
    }
    currBal[paidBy].paid += amount;

    const shares = getBeneficiaryShares(expense);
    for (let i = 0; i < beneficiaries.length; i++) {
      const pid = beneficiaries[i].participantId;
      if (!currBal[pid]) {
        currBal[pid] = { paid: 0, owed: 0, net: 0 };
      }
      currBal[pid].owed += shares[i];
    }
  }

  // Compute net for each
  for (const code of Object.keys(balances)) {
    for (const pid of Object.keys(balances[code])) {
      const entry = balances[code][pid];
      entry.net = Math.round((entry.paid - entry.owed) * 100) / 100;
    }
  }

  return balances;
}

export function getStatus(net: number): 'creditor' | 'debtor' | 'settled' {
  if (net > 0.005) return 'creditor';
  if (net < -0.005) return 'debtor';
  return 'settled';
}
