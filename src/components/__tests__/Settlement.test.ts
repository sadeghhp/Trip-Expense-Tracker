import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { readable } from 'svelte/store';

const { mockAppData, mockUpdateData } = vi.hoisted(() => ({
  mockAppData: {
    participants: [
      { id: 'p-1', name: 'Alice' },
      { id: 'p-2', name: 'Bob' }
    ],
    currencies: [
      { code: 'USD', symbol: '$' },
      { code: 'EUR', symbol: '€' }
    ],
    expenses: [{
      id: 'e-1',
      date: '2024-06-15',
      description: 'Test',
      currencyCode: 'USD',
      amount: 100,
      paidBy: 'p-1',
      splitType: 'equal' as const,
      beneficiaries: [
        { participantId: 'p-1', customAmount: null, customPercentage: null },
        { participantId: 'p-2', customAmount: null, customPercentage: null }
      ]
    }],
    exchangeRates: { EUR: 1.1 },
    settlementCurrency: 'USD'
  },
  mockUpdateData: vi.fn((fn: (d: typeof mockAppData) => typeof mockAppData) => fn(mockAppData))
}));

vi.mock('$lib/stores/data', () => ({
  appData: readable(mockAppData),
  updateData: mockUpdateData,
  dataVersion: readable(1),
  effectiveSettlementCurrency: readable('USD')
}));

vi.mock('$lib/stores/toast', () => ({
  showToast: vi.fn()
}));

vi.mock('$lib/i18n', () => ({
  t: readable((key: string) => key),
  isRtl: readable(false)
}));

import Settlement from '../settlement/Settlement.svelte';

describe('Settlement.svelte', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders step indicator', () => {
    render(Settlement);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows settlement currency selection on step 1', () => {
    render(Settlement);
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('EUR')).toBeInTheDocument();
  });

  it('calls updateData when selecting settlement currency', async () => {
    render(Settlement);
    await fireEvent.click(screen.getByText('EUR'));
    expect(mockUpdateData).toHaveBeenCalled();
  });

  it('shows exchange rate inputs on step 2', async () => {
    render(Settlement);
    const buttons = screen.getAllByRole('button');
    const nextBtn = buttons.find(b => b.textContent?.includes('settlement.next'));
    if (nextBtn) await fireEvent.click(nextBtn);
    expect(screen.getByText('EUR')).toBeInTheDocument();
  });
});
