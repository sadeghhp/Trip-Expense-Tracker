import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { readable } from 'svelte/store';

const { mockAppData, mockUpdateData, mockAddExpense, mockUpdateExpense } = vi.hoisted(() => ({
  mockAppData: {
    participants: [
      { id: 'p-1', name: 'Alice' },
      { id: 'p-2', name: 'Bob' }
    ],
    currencies: [{ code: 'USD', symbol: '$' }],
    expenses: [],
    exchangeRates: {},
    settlementCurrency: 'USD'
  },
  mockUpdateData: vi.fn(),
  mockAddExpense: vi.fn(() => ({ success: true, expenseId: 'new-expense-id' })),
  mockUpdateExpense: vi.fn(() => ({ success: true, expenseId: 'e-1' }))
}));

vi.mock('$lib/stores/data', () => ({
  appData: readable(mockAppData),
  updateData: mockUpdateData,
  addExpense: mockAddExpense,
  updateExpense: mockUpdateExpense
}));

vi.mock('$lib/stores/toast', () => ({
  showToast: vi.fn()
}));

vi.mock('$lib/i18n', () => ({
  t: readable((key: string) => key),
  locale: readable('en'),
  setLocale: vi.fn()
}));

vi.mock('$lib/utils/id', () => ({
  generateId: () => 'new-expense-id'
}));

vi.mock('svelte/transition', () => ({
  fly: () => ({ duration: 0, css: () => '', tick: () => {} })
}));

vi.mock('../ui/ImageViewer.svelte', () => ({ default: {} }));
vi.mock('../ui/ReceiptThumbnail.svelte', () => ({ default: {} }));

import ExpenseForm from '../expenses/ExpenseForm.svelte';

describe('ExpenseForm.svelte', () => {
  const onSave = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form for new expense', () => {
    render(ExpenseForm, { props: { expense: null, onSave, onClose } });
    expect(screen.getByText('expenseForm.addTitle')).toBeInTheDocument();
  });

  it('shows validation error on invalid submit', async () => {
    render(ExpenseForm, { props: { expense: null, onSave, onClose } });
    const descInputs = screen.getAllByRole('textbox');
    await fireEvent.input(descInputs[0], { target: { value: '' } });
    await fireEvent.click(screen.getByText('expenseForm.addExpense'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('calls onSave on valid submit', async () => {
    render(ExpenseForm, { props: { expense: null, onSave, onClose } });
    const descInputs = screen.getAllByRole('textbox');
    await fireEvent.input(descInputs[0], { target: { value: 'Lunch' } });
    const amountInput = screen.getByRole('spinbutton');
    await fireEvent.input(amountInput, { target: { value: '50' } });
    await fireEvent.click(screen.getByText('expenseForm.addExpense'));
    expect(mockAddExpense).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith({ expenseId: 'new-expense-id' });
  });

  it('does not report a save when the store rejects the write', async () => {
    mockAddExpense.mockReturnValueOnce({ success: false, error: 'persist_failed' } as never);
    render(ExpenseForm, { props: { expense: null, onSave, onClose } });
    const descInputs = screen.getAllByRole('textbox');
    await fireEvent.input(descInputs[0], { target: { value: 'Lunch' } });
    await fireEvent.input(screen.getByRole('spinbutton'), { target: { value: '50' } });
    await fireEvent.click(screen.getByText('expenseForm.addExpense'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('treats a prefill as a NEW expense, never as an edit', async () => {
    // A prefilled record (pending-import review) must be added, not matched
    // against stored expenses by id.
    const prefill = {
      id: 'prefill-id',
      date: '2024-06-15',
      description: 'From CSV',
      currencyCode: 'USD',
      amount: 30,
      paidBy: 'p-1',
      splitType: 'equal' as const,
      beneficiaries: [
        { participantId: 'p-1', customAmount: null, customPercentage: null },
        { participantId: 'p-2', customAmount: null, customPercentage: null }
      ]
    };
    render(ExpenseForm, { props: { expense: null, prefill, onSave, onClose } });
    expect(screen.getByText('expenseForm.addTitle')).toBeInTheDocument();
    await fireEvent.click(screen.getByText('expenseForm.addExpense'));
    expect(mockAddExpense).toHaveBeenCalled();
    expect(mockUpdateExpense).not.toHaveBeenCalled();
  });

  it('calls onClose when close button clicked', async () => {
    render(ExpenseForm, { props: { expense: null, onSave, onClose } });
    const closeBtn = screen.getAllByRole('button')[0];
    await fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('pre-fills fields when editing expense', () => {
    const expense = {
      id: 'e-1',
      date: '2024-06-15',
      description: 'Dinner',
      currencyCode: 'USD',
      amount: 75,
      paidBy: 'p-1',
      splitType: 'equal' as const,
      beneficiaries: [
        { participantId: 'p-1', customAmount: null, customPercentage: null },
        { participantId: 'p-2', customAmount: null, customPercentage: null }
      ]
    };
    render(ExpenseForm, { props: { expense, onSave, onClose } });
    expect(screen.getByDisplayValue('Dinner')).toBeInTheDocument();
    expect(screen.getByDisplayValue('75')).toBeInTheDocument();
  });

  it('shows split type options', () => {
    render(ExpenseForm, { props: { expense: null, onSave, onClose } });
    expect(screen.getByText('expenseForm.equal')).toBeInTheDocument();
    expect(screen.getByText('expenseForm.custom')).toBeInTheDocument();
    expect(screen.getByText('expenseForm.percentage')).toBeInTheDocument();
  });
});
