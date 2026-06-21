import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';

vi.mock('$lib/stores/data', () => ({
  appData: readable({
    participants: [{ id: 'p-1', name: 'Alice' }],
    currencies: [{ code: 'USD', symbol: '$' }],
    expenses: [],
    exchangeRates: {},
    settlementCurrency: 'USD'
  }),
  updateData: vi.fn(),
  importAsNewTrip: vi.fn()
}));

vi.mock('$lib/stores/toast', () => ({
  showToast: vi.fn()
}));

vi.mock('$lib/i18n', () => ({
  t: readable((key: string) => key),
  isRtl: readable(false)
}));

vi.mock('../ui/Modal.svelte', async () => {
  const { default: ModalStub } = await import('./stubs/ModalStub.svelte');
  return { default: ModalStub };
});

import CsvImportWizard from '../settings/CsvImportWizard.svelte';

describe('CsvImportWizard.svelte', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render content when closed', () => {
    render(CsvImportWizard, { props: { open: false, onClose } });
    expect(screen.queryByTestId('csv-modal')).not.toBeInTheDocument();
  });

  it('renders modal when open', () => {
    render(CsvImportWizard, { props: { open: true, onClose } });
    expect(screen.getByTestId('csv-modal')).toBeInTheDocument();
  });
});

describe('CsvImportWizard column detection', () => {
  it('detectColumnMapping works on sample headers', async () => {
    const { detectColumnMapping } = await import('$lib/utils/csv-mapper');
    const mapping = detectColumnMapping(['Date', 'Description', 'Amount', 'Currency', 'Payer']);
    expect(mapping.date).toBe('Date');
    expect(mapping.amount).toBe('Amount');
    expect(mapping.payer).toBe('Payer');
  });

  it('parseCsv works on sample CSV text', async () => {
    const { parseCsv } = await import('$lib/utils/csv-parser');
    const result = parseCsv('Date,Amount,Payer\n2024-01-01,50,Alice');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].Amount).toBe('50');
  });

  it('getMappingCompleteness identifies required fields', async () => {
    const { detectColumnMapping, getMappingCompleteness } = await import('$lib/utils/csv-mapper');
    const mapping = detectColumnMapping(['Date', 'Description', 'Amount']);
    const completeness = getMappingCompleteness(mapping);
    expect(completeness.missing).toEqual([]);
    expect(completeness.mapped).toBeGreaterThanOrEqual(3);
  });
});
