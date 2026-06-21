import { describe, it, expect } from 'vitest';
import { detectDelimiter, parseCsv } from './csv-parser';

describe('detectDelimiter', () => {
  it.each([
    ['a,b,c', ','],
    ['a;b;c', ';'],
    ['a\tb\tc', '\t'],
    ['a|b|c', '|'],
    ['no delimiters', ',']
  ])('detectDelimiter(%j) returns %j', (line, expected) => {
    expect(detectDelimiter(line)).toBe(expected);
  });

  it('picks most frequent delimiter when mixed', () => {
    expect(detectDelimiter('a,b;c,d')).toBe(',');
  });
});

describe('parseCsv', () => {
  it('parses simple CSV with headers and rows', () => {
    const result = parseCsv('Date,Amount\n2024-01-01,100\n2024-01-02,200');
    expect(result.headers).toEqual(['Date', 'Amount']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ Date: '2024-01-01', Amount: '100' });
  });

  it('strips BOM', () => {
    const result = parseCsv('\uFEFFDate,Amount\n2024-01-01,100');
    expect(result.headers[0]).toBe('Date');
  });

  it('handles quoted fields with delimiter inside', () => {
    const result = parseCsv('Desc,Amount\n"Hello, world",100');
    expect(result.rows[0].Desc).toBe('Hello, world');
  });

  it('handles escaped quotes', () => {
    const result = parseCsv('Desc\n"He said ""hi"""');
    expect(result.rows[0].Desc).toBe('He said "hi"');
  });

  it('filters empty lines', () => {
    const result = parseCsv('Date,Amount\n\n2024-01-01,100\n\n');
    expect(result.rows).toHaveLength(1);
  });

  it('returns empty for empty input', () => {
    const result = parseCsv('');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it('defaults missing columns to empty string', () => {
    const result = parseCsv('A,B,C\n1,2');
    expect(result.rows[0].C).toBe('');
  });

  it('handles Windows line endings', () => {
    const result = parseCsv('Date,Amount\r\n2024-01-01,100\r\n2024-01-02,200');
    expect(result.rows).toHaveLength(2);
  });

  it('handles single column CSV', () => {
    const result = parseCsv('Name\nAlice\nBob');
    expect(result.headers).toEqual(['Name']);
    expect(result.rows).toHaveLength(2);
  });

  it('handles Unicode content', () => {
    const result = parseCsv('شرح,مبلغ\nناهار,۵۰۰۰۰');
    expect(result.headers).toEqual(['شرح', 'مبلغ']);
    expect(result.rows[0]['شرح']).toBe('ناهار');
  });

  it('reports correct delimiter and row count', () => {
    const result = parseCsv('A;B\n1;2\n3;4');
    expect(result.delimiter).toBe(';');
    expect(result.rowCount).toBe(2);
  });
});
