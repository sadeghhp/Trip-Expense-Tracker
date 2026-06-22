import { describe, it, expect } from 'vitest';
import { detectColumnMapping, getMappingCompleteness } from './csv-mapper';

describe('detectColumnMapping', () => {
  it('maps English headers', () => {
    const headers = ['Date', 'Description', 'Amount', 'Currency', 'Payer'];
    const mapping = detectColumnMapping(headers);
    expect(mapping.date).toBe('Date');
    expect(mapping.description).toBe('Description');
    expect(mapping.amount).toBe('Amount');
    expect(mapping.currency).toBe('Currency');
    expect(mapping.payer).toBe('Payer');
  });

  it('maps Persian headers', () => {
    const headers = ['تاریخ', 'شرح', 'مبلغ', 'ارز', 'پرداخت کننده'];
    const mapping = detectColumnMapping(headers);
    expect(mapping.date).toBe('تاریخ');
    expect(mapping.description).toBe('شرح');
    expect(mapping.amount).toBe('مبلغ');
    expect(mapping.currency).toBe('ارز');
    expect(mapping.payer).toBe('پرداخت کننده');
  });

  it('handles different casing and extra spaces', () => {
    const headers = ['  TRANSACTION DATE  ', 'MEMO', 'TOTAL'];
    const mapping = detectColumnMapping(headers);
    expect(mapping.date).toBe('  TRANSACTION DATE  ');
    expect(mapping.description).toBe('MEMO');
    expect(mapping.amount).toBe('TOTAL');
  });

  it('matches partial headers', () => {
    const mapping = detectColumnMapping(['Transaction Date', 'Entry Details']);
    expect(mapping.date).toBe('Transaction Date');
    expect(mapping.description).toBe('Entry Details');
  });

  it('normalizes underscores and hyphens', () => {
    const mapping = detectColumnMapping(['entry_type', 'transaction-id']);
    expect(mapping.entryType).toBe('entry_type');
    expect(mapping.id).toBe('transaction-id');
  });

  it('returns null for unrecognized headers', () => {
    const mapping = detectColumnMapping(['foo', 'bar', 'baz']);
    expect(mapping.date).toBeNull();
    expect(mapping.amount).toBeNull();
  });

  it('maps mixed English and Persian headers', () => {
    const mapping = detectColumnMapping(['Date', 'شرح', 'Amount']);
    expect(mapping.date).toBe('Date');
    expect(mapping.description).toBe('شرح');
    expect(mapping.amount).toBe('Amount');
  });

  it('maps optional columns', () => {
    const mapping = detectColumnMapping(['Date', 'Description', 'Amount', 'Payee', 'Flag', 'Notes']);
    expect(mapping.payee).toBe('Payee');
    expect(mapping.flag).toBe('Flag');
    expect(mapping.notes).toBe('Notes');
  });

  it('does not map Payee column as description', () => {
    const mapping = detectColumnMapping(['Date', 'Amount', 'Payee', 'Paid by']);
    expect(mapping.description).toBeNull();
    expect(mapping.payee).toBe('Payee');
    expect(mapping.payer).toBe('Paid by');
  });

  it('does not match headers containing "to" as substring', () => {
    const mapping = detectColumnMapping(['Date', 'Description', 'Amount', 'Store', 'Beneficiary']);
    expect(mapping.payee).toBe('Beneficiary');
  });

  it('matches standalone "To" header as payee', () => {
    const mapping = detectColumnMapping(['Date', 'Description', 'Amount', 'From', 'To']);
    expect(mapping.payer).toBe('From');
    expect(mapping.payee).toBe('To');
  });

  it('does not match "Total" as payee or "Invalid" as id', () => {
    const mapping = detectColumnMapping(['Date', 'Description', 'Total', 'Invalid', 'Payee']);
    expect(mapping.amount).toBe('Total');
    expect(mapping.id).toBeNull();
    expect(mapping.payee).toBe('Payee');
  });

  it('does not match "Prototype" as entry type', () => {
    const mapping = detectColumnMapping(['Date', 'Description', 'Amount', 'Prototype']);
    expect(mapping.entryType).toBeNull();
  });

  it('does not assign same header to multiple fields', () => {
    const mapping = detectColumnMapping(['Date', 'Amount', 'Notes']);
    expect(mapping.date).toBe('Date');
    expect(mapping.amount).toBe('Amount');
    expect(mapping.notes).toBe('Notes');
    const values = [mapping.date, mapping.amount, mapping.notes].filter(Boolean);
    expect(new Set(values).size).toBe(values.length);
  });

  it('maps Paid by as payer and Beneficiary as payee', () => {
    const mapping = detectColumnMapping(['Date', 'Description', 'Amount', 'Paid by', 'Beneficiary']);
    expect(mapping.payer).toBe('Paid by');
    expect(mapping.payee).toBe('Beneficiary');
  });

  it('maps recipient as payee', () => {
    const mapping = detectColumnMapping(['Date', 'Description', 'Amount', 'Recipient']);
    expect(mapping.payee).toBe('Recipient');
  });
});

describe('getMappingCompleteness', () => {
  it('reports all fields mapped', () => {
    const mapping = detectColumnMapping([
      'Date', 'Description', 'Amount', 'Currency', 'Payer',
      'Payee', 'entry_type', 'id', 'flag', 'notes'
    ]);
    const result = getMappingCompleteness(mapping);
    expect(result.mapped).toBe(10);
    expect(result.total).toBe(10);
    expect(result.missing).toEqual([]);
  });

  it('reports only required fields mapped', () => {
    const result = getMappingCompleteness({
      date: 'Date',
      description: 'Desc',
      amount: 'Amount',
      currency: null,
      payer: null,
      payee: null,
      entryType: null,
      id: null,
      flag: null,
      notes: null
    });
    expect(result.mapped).toBe(3);
    expect(result.missing).toEqual([]);
  });

  it('reports missing required fields', () => {
    const result = getMappingCompleteness({
      date: 'Date',
      description: null,
      amount: null,
      currency: null,
      payer: null,
      payee: null,
      entryType: null,
      id: null,
      flag: null,
      notes: null
    });
    expect(result.missing).toContain('description');
    expect(result.missing).toContain('amount');
  });

  it('reports zero mapped when all null', () => {
    const result = getMappingCompleteness({
      date: null,
      description: null,
      amount: null,
      currency: null,
      payer: null,
      payee: null,
      entryType: null,
      id: null,
      flag: null,
      notes: null
    });
    expect(result.mapped).toBe(0);
    expect(result.missing).toEqual(['date', 'description', 'amount']);
  });
});
