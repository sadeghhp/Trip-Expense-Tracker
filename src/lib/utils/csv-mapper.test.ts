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
