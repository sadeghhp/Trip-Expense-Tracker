import { describe, it, expect } from 'vitest';
import { parseReceiptQR } from './barcodeScanner';
import type { BarcodeResult } from '../types';

function qr(text: string): BarcodeResult {
  return { text, format: 'QRCode' };
}

function nonQr(text: string): BarcodeResult {
  return { text, format: 'EAN13' };
}

describe('parseReceiptQR', () => {
  it('returns null when no QR codes', () => {
    expect(parseReceiptQR([nonQr('123')])).toBeNull();
  });

  it('parses JSON with amount field', () => {
    const result = parseReceiptQR([qr('{"amount":100}')]);
    expect(result?.amount).toBe(100);
  });

  it('parses JSON with totalAmount field', () => {
    const result = parseReceiptQR([qr('{"totalAmount":200}')]);
    expect(result?.amount).toBe(200);
  });

  it('parses JSON with total field', () => {
    const result = parseReceiptQR([qr('{"total":150}')]);
    expect(result?.amount).toBe(150);
  });

  it('parses JSON with date, taxId, merchant', () => {
    const result = parseReceiptQR([qr('{"amount":10,"date":"2024-06-15","taxId":"T1","merchant":"Shop"}')]);
    expect(result).toMatchObject({
      amount: 10,
      date: '2024-06-15',
      taxId: 'T1',
      merchant: 'Shop'
    });
  });

  it('returns null for empty JSON object', () => {
    expect(parseReceiptQR([qr('{}')])).toBeNull();
  });

  it('parses Iranian tax URL', () => {
    const result = parseReceiptQR([
      qr('https://tax.gov.ir/?id=ABC123&amount=50000')
    ]);
    expect(result).toMatchObject({
      currency: 'IRR',
      taxId: 'ABC123',
      amount: 50000
    });
  });

  it('parses semicolon-delimited Iranian receipt', () => {
    const text = 'TAXID;2024/06/15;14:30:00;250000;extra';
    const result = parseReceiptQR([qr(text)]);
    expect(result?.amount).toBe(250000);
    expect(result?.date).toBe('2024-06-15');
    expect(result?.currency).toBe('IRR');
    expect(result?.taxId).toBe('TAXID');
  });

  it('excludes time-like parts from amount in semicolon format', () => {
    const text = 'ID;2024-06-15;143059;50000';
    const result = parseReceiptQR([qr(text)]);
    expect(result?.amount).toBe(50000);
  });

  it('parses key-value format with English keys', () => {
    const text = 'amount=100\ndate=2024-06-15\ntaxId=TX1\nmerchant=Store';
    const result = parseReceiptQR([qr(text)]);
    expect(result).toMatchObject({
      amount: 100,
      date: '2024-06-15',
      taxId: 'TX1',
      merchant: 'Store'
    });
  });

  it('parses key-value format with Persian keys', () => {
    const text = 'مبلغ=50000\nتاریخ=2024-06-15\nشناسه مالیاتی=TX2\nفروشگاه=Cafe';
    const result = parseReceiptQR([qr(text)]);
    expect(result?.amount).toBe(50000);
    expect(result?.date).toBe('2024-06-15');
    expect(result?.taxId).toBe('TX2');
    expect(result?.merchant).toBe('Cafe');
  });

  it('returns null for key-value with fewer than 2 lines', () => {
    expect(parseReceiptQR([qr('amount=100')])).toBeNull();
  });

  it('uses first parseable QR among multiple', () => {
    const result = parseReceiptQR([
      nonQr('ignored'),
      qr('not-json'),
      qr('{"amount":42}')
    ]);
    expect(result?.amount).toBe(42);
  });

  it('excludes time-like parts when picking amount in semicolon format', () => {
    const text = 'TAXID;2024/06/15;14:30;50000;extra';
    const result = parseReceiptQR([qr(text)]);
    expect(result?.amount).toBe(50000);
  });

  it('uses largest numeric value in semicolon format', () => {
    const text = 'TAXID;2024-06-15;250000;1000';
    const result = parseReceiptQR([qr(text)]);
    expect(result?.amount).toBe(250000);
  });
});
