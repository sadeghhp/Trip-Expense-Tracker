import type { Expense } from '../types';

export function getEqualSharePreview(amount: number, paidBy: string, beneficiaryIds: string[]): { share: number; exact: boolean } {
  if (beneficiaryIds.length === 0) return { share: 0, exact: true };
  const shares = getBeneficiaryShares({
    id: '', date: '', description: '', currencyCode: '',
    amount,
    paidBy,
    splitType: 'equal',
    beneficiaries: beneficiaryIds.map(pid => ({ participantId: pid, customAmount: null, customPercentage: null }))
  });
  const payerIdx = beneficiaryIds.indexOf(paidBy);
  const share = shares[payerIdx >= 0 ? payerIdx : 0];
  const totalCents = Math.round(amount * 100);
  const exact = totalCents % beneficiaryIds.length === 0;
  return { share, exact };
}

export function getBeneficiaryShares(expense: Expense): number[] {
  const { splitType, beneficiaries, amount, paidBy } = expense;

  if (splitType === 'custom') {
    return beneficiaries.map(b => b.customAmount ?? 0);
  }

  if (splitType === 'percentage') {
    const shares = beneficiaries.map(b =>
      Math.round(amount * (b.customPercentage ?? 0)) / 100
    );

    const pctSum = Math.round(shares.reduce((s, v) => s + v, 0) * 100);
    const pctDiff = Math.round(amount * 100) - pctSum;

    if (pctDiff !== 0) {
      const payerIdx = beneficiaries.findIndex(b => b.participantId === paidBy);
      const adjustIdx = payerIdx >= 0 ? payerIdx : shares.length - 1;
      shares[adjustIdx] = (Math.round(shares[adjustIdx] * 100) + pctDiff) / 100;
    }

    return shares;
  }

  // Equal split
  const count = beneficiaries.length;
  const totalCents = Math.round(amount * 100);
  const perPersonCents = Math.floor(totalCents / count);
  const remainderCents = totalCents - perPersonCents * count;
  const payerIdx = beneficiaries.findIndex(b => b.participantId === paidBy);

  return beneficiaries.map((_, i) => {
    let extra = 0;
    if (remainderCents > 0) {
      if (payerIdx >= 0) {
        if (i === payerIdx) {
          extra = 1;
        } else {
          const pos = i < payerIdx ? i : i - 1;
          if (pos < remainderCents - 1) {
            extra = 1;
          }
        }
      } else {
        if (i < remainderCents) {
          extra = 1;
        }
      }
    }
    return (perPersonCents + extra) / 100;
  });
}
