import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAndValidateReceiptJson, mergeBarcodeData, analyzeReceipt } from './receiptScanner';
import type { ReceiptData, BarcodeResult } from '../types';

vi.mock('../stores/aiSettings', () => ({
  getAISettings: vi.fn(),
  getChatCompletionsUrl: vi.fn((url: string) => `${url.replace(/\/+$/, '')}/chat/completions`)
}));

import { getAISettings } from '../stores/aiSettings';

const validReceiptJson = JSON.stringify({
  title: 'Lunch',
  date: '2024-06-15',
  totalAmount: 42.5,
  currency: 'usd',
  merchant: 'Cafe',
  category: 'Food',
  lineItems: [{ name: 'Coffee', quantity: 2, amount: 10 }],
  tax: 2.5,
  tip: 5,
  confidence: 1.5,
  notes: 'Test note'
});

describe('parseAndValidateReceiptJson', () => {
  it('parses valid JSON', () => {
    const result = parseAndValidateReceiptJson(validReceiptJson);
    expect(result.title).toBe('Lunch');
    expect(result.totalAmount).toBe(42.5);
    expect(result.currency).toBe('USD');
    expect(result.category).toBe('Food');
    expect(result.confidence).toBe(1);
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0].quantity).toBe(2);
  });

  it('extracts JSON from markdown fences', () => {
    const fenced = '```json\n' + validReceiptJson + '\n```';
    const result = parseAndValidateReceiptJson(fenced);
    expect(result.totalAmount).toBe(42.5);
  });

  it('throws for invalid JSON', () => {
    expect(() => parseAndValidateReceiptJson('not json')).toThrow('receipt.errorInvalidJson');
  });

  it('throws when totalAmount missing', () => {
    expect(() => parseAndValidateReceiptJson('{"title":"X"}')).toThrow('receipt.errorNoAmount');
  });

  it('throws when totalAmount is zero or negative', () => {
    expect(() => parseAndValidateReceiptJson('{"totalAmount":0}')).toThrow('receipt.errorNoAmount');
    expect(() => parseAndValidateReceiptJson('{"totalAmount":-5}')).toThrow('receipt.errorNoAmount');
  });

  it('defaults missing title', () => {
    const result = parseAndValidateReceiptJson('{"totalAmount":10}');
    expect(result.title).toBe('Receipt expense');
  });

  it('rejects invalid date format', () => {
    const result = parseAndValidateReceiptJson('{"totalAmount":10,"date":"06/15/2024"}');
    expect(result.date).toBeNull();
  });

  it('rejects currency that is too short', () => {
    const result = parseAndValidateReceiptJson('{"totalAmount":10,"currency":"U"}');
    expect(result.currency).toBeNull();
  });

  it('rejects invalid category', () => {
    const result = parseAndValidateReceiptJson('{"totalAmount":10,"category":"Invalid"}');
    expect(result.category).toBeNull();
  });

  it('filters invalid line items', () => {
    const result = parseAndValidateReceiptJson(JSON.stringify({
      totalAmount: 10,
      lineItems: [
        { name: 'Valid', amount: 5 },
        { name: 'No amount' },
        { amount: 5 }
      ]
    }));
    expect(result.lineItems).toHaveLength(1);
  });

  it('defaults line item quantity to 1', () => {
    const result = parseAndValidateReceiptJson(JSON.stringify({
      totalAmount: 10,
      lineItems: [{ name: 'Item', amount: 10 }]
    }));
    expect(result.lineItems[0].quantity).toBe(1);
  });

  it('preserves tax and tip when numeric', () => {
    const result = parseAndValidateReceiptJson(JSON.stringify({
      totalAmount: 10,
      tax: 1.5,
      tip: null
    }));
    expect(result.tax).toBe(1.5);
    expect(result.tip).toBeNull();
  });
});

describe('mergeBarcodeData', () => {
  const baseReceipt: ReceiptData = {
    title: 'Receipt',
    date: null,
    totalAmount: 50,
    currency: 'USD',
    merchant: null,
    category: null,
    lineItems: [],
    tax: null,
    tip: null,
    confidence: 0.5,
    notes: null
  };

  it('returns receipt unchanged when no barcodes', () => {
    expect(mergeBarcodeData(baseReceipt, [])).toEqual(baseReceipt);
  });

  it('appends barcode data when no QR parseable', () => {
    const barcodes: BarcodeResult[] = [{ text: '12345', format: 'EAN13' }];
    const result = mergeBarcodeData(baseReceipt, barcodes);
    expect(result.barcodeData).toEqual(barcodes);
    expect(result.totalAmount).toBe(50);
  });

  it('overrides amount when QR matches currency', () => {
    const barcodes: BarcodeResult[] = [{
      text: JSON.stringify({ amount: 99, currency: 'USD' }),
      format: 'QRCode'
    }];
    const result = mergeBarcodeData(baseReceipt, barcodes);
    expect(result.totalAmount).toBe(99);
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('does not override amount on currency mismatch', () => {
    const barcodes: BarcodeResult[] = [{
      text: 'https://tax.gov.ir/?id=ABC&amount=99',
      format: 'QRCode'
    }];
    const result = mergeBarcodeData(baseReceipt, barcodes);
    expect(result.totalAmount).toBe(50);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('overrides amount when no currency in either', () => {
    const receipt = { ...baseReceipt, currency: null };
    const barcodes: BarcodeResult[] = [{
      text: JSON.stringify({ amount: 75 }),
      format: 'QRCode'
    }];
    const result = mergeBarcodeData(receipt, barcodes);
    expect(result.totalAmount).toBe(75);
  });

  it('overrides date and merchant from QR', () => {
    const barcodes: BarcodeResult[] = [{
      text: JSON.stringify({ amount: 10, date: '2024-01-01', merchant: 'Store' }),
      format: 'QRCode'
    }];
    const result = mergeBarcodeData(baseReceipt, barcodes);
    expect(result.date).toBe('2024-01-01');
    expect(result.merchant).toBe('Store');
  });

  it('merges notes with existing notes', () => {
    const receipt = { ...baseReceipt, notes: 'Existing' };
    const barcodes: BarcodeResult[] = [{
      text: JSON.stringify({ amount: 10, taxId: 'TAX123' }),
      format: 'QRCode'
    }];
    const result = mergeBarcodeData(receipt, barcodes);
    expect(result.notes).toContain('Existing');
    expect(result.notes).toContain('Tax ID: TAX123');
  });
});

describe('analyzeReceipt', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it('throws when no API config', async () => {
    vi.mocked(getAISettings).mockReturnValue({ baseUrl: '', apiKey: '', model: '', customPrompt: '' });
    await expect(analyzeReceipt('data:image/png;base64,abc')).rejects.toThrow('receipt.errorNoConfig');
  });

  it('throws when image too large', async () => {
    vi.mocked(getAISettings).mockReturnValue({
      baseUrl: 'https://api.example.com',
      apiKey: 'key',
      model: 'model',
      customPrompt: ''
    });
    const large = 'x'.repeat(20_000_001);
    await expect(analyzeReceipt(large)).rejects.toThrow('receipt.errorImageTooLarge');
  });

  it.each([
    [401, 'receipt.errorInvalidKey'],
    [402, 'receipt.errorNoCredits'],
    [429, 'receipt.errorRateLimit'],
    [500, 'receipt.errorGeneric']
  ])('throws on HTTP %i', async (status, errorKey) => {
    vi.mocked(getAISettings).mockReturnValue({
      baseUrl: 'https://api.example.com',
      apiKey: 'key',
      model: 'model',
      customPrompt: ''
    });
    vi.mocked(global.fetch).mockResolvedValue({ ok: false, status } as Response);
    await expect(analyzeReceipt('data:image/png;base64,abc')).rejects.toThrow(errorKey);
  });

  it('throws on empty response body', async () => {
    vi.mocked(getAISettings).mockReturnValue({
      baseUrl: 'https://api.example.com',
      apiKey: 'key',
      model: 'model',
      customPrompt: ''
    });
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '' } }] })
    } as Response);
    await expect(analyzeReceipt('data:image/png;base64,abc')).rejects.toThrow('receipt.errorEmptyResponse');
  });

  it('returns parsed receipt on success', async () => {
    vi.mocked(getAISettings).mockReturnValue({
      baseUrl: 'https://api.example.com',
      apiKey: 'key',
      model: 'model',
      customPrompt: 'Custom'
    });
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"totalAmount":25,"title":"Test"}' } }]
      })
    } as Response);
    const result = await analyzeReceipt('data:image/png;base64,abc');
    expect(result.totalAmount).toBe(25);
    expect(result.title).toBe('Test');
  });
});
