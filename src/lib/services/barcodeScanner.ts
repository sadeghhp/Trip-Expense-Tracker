import type { BarcodeResult } from '../types';

interface ParsedQRData {
  amount?: number;
  currency?: string;
  date?: string;
  taxId?: string;
  merchant?: string;
}

let readerModule: Promise<typeof import('zxing-wasm/reader')> | null = null;

function getReader() {
  if (!readerModule) {
    readerModule = import('zxing-wasm/reader');
  }
  return readerModule;
}

const BARCODE_MAX_DIM = 1200;

export async function scanBarcodesFromImage(input: string | ImageData): Promise<BarcodeResult[]> {
  try {
    const { readBarcodes } = await getReader();

    let imageData: ImageData;
    if (input instanceof ImageData) {
      imageData = input;
    } else {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = input;
      });

      const scale = Math.min(1, BARCODE_MAX_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return [];
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    const results = await readBarcodes(imageData, {
      formats: ['QRCode', 'EAN13', 'EAN8', 'Code128', 'Code39', 'PDF417', 'DataMatrix'],
      tryHarder: true,
      maxNumberOfSymbols: 5,
    });

    return results
      .filter(r => r.isValid)
      .map(r => ({
        text: r.text,
        format: r.format,
      }));
  } catch (err) {
    console.warn('[barcodeScanner] scan failed:', err);
    return [];
  }
}

export function parseReceiptQR(barcodes: BarcodeResult[]): ParsedQRData | null {
  for (const barcode of barcodes) {
    if (barcode.format !== 'QRCode') continue;
    const parsed = tryParseQRContent(barcode.text);
    if (parsed) return parsed;
  }
  return null;
}

function tryParseQRContent(text: string): ParsedQRData | null {
  // Try JSON format (some modern POS systems)
  const jsonResult = tryParseJson(text);
  if (jsonResult) return jsonResult;

  // Try Iranian tax system (سامانه مودیان) URLs
  const iranianResult = tryParseIranianTaxQR(text);
  if (iranianResult) return iranianResult;

  // Try key=value or key:value format
  const kvResult = tryParseKeyValue(text);
  if (kvResult) return kvResult;

  return null;
}

function tryParseJson(text: string): ParsedQRData | null {
  try {
    const data = JSON.parse(text);
    if (typeof data !== 'object' || data === null) return null;

    const result: ParsedQRData = {};
    if (typeof data.amount === 'number' && data.amount > 0) result.amount = data.amount;
    if (typeof data.totalAmount === 'number' && data.totalAmount > 0) result.amount = data.totalAmount;
    if (typeof data.total === 'number' && data.total > 0) result.amount = data.total;

    if (typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
      result.date = data.date;
    }
    if (typeof data.taxId === 'string') result.taxId = data.taxId;
    if (typeof data.merchant === 'string') result.merchant = data.merchant;

    if (Object.keys(result).length === 0) return null;
    return result;
  } catch {
    return null;
  }
}

function isTimeLikePart(part: string): boolean {
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(part)) return true;
  if (/^\d{6}$/.test(part)) {
    const hh = parseInt(part.slice(0, 2));
    const mm = parseInt(part.slice(2, 4));
    const ss = parseInt(part.slice(4, 6));
    if (hh < 24 && mm < 60 && ss < 60) return true;
  }
  return false;
}

function tryParseIranianTaxQR(text: string): ParsedQRData | null {
  const iranianDomains = ['tax.gov.ir', 'ntsw.ir', 'evat.ir', 'tax.ir', 'stuffam.ir'];
  const isIranianTax = iranianDomains.some(d => text.includes(d));

  if (!isIranianTax) {
    const parts = text.split(';');
    if (parts.length >= 4) {
      const result: ParsedQRData = {};
      const dateParts = new Set<number>();

      for (let i = 0; i < parts.length; i++) {
        if (/^\d{4}[/-]\d{2}[/-]\d{2}$/.test(parts[i])) {
          result.date = parts[i].replace(/\//g, '-');
          dateParts.add(i);
        }
      }

      let bestAmount = -1;
      for (let i = 1; i < parts.length; i++) {
        if (dateParts.has(i)) continue;
        if (isTimeLikePart(parts[i])) continue;
        const num = parseFloat(parts[i].replace(/,/g, ''));
        if (!isNaN(num) && num > 0 && num > bestAmount) {
          bestAmount = num;
        }
      }

      if (bestAmount > 0) result.amount = bestAmount;
      if (result.amount || result.date) {
        result.currency = 'IRR';
        result.taxId = parts[0];
        return result;
      }
    }
    return null;
  }

  try {
    const url = new URL(text);
    const result: ParsedQRData = { currency: 'IRR' };

    const id = url.searchParams.get('id') || url.searchParams.get('uid') || url.searchParams.get('taxid');
    if (id) result.taxId = id;

    const amountParam = url.searchParams.get('amount') || url.searchParams.get('amt');
    if (amountParam) {
      const amt = parseFloat(amountParam);
      if (!isNaN(amt) && amt > 0) result.amount = amt;
    }

    if (!result.taxId && !result.amount) return null;
    return result;
  } catch {
    return null;
  }
}

function tryParseKeyValue(text: string): ParsedQRData | null {
  const lines = text.split(/[\n\r]+/);
  if (lines.length < 2) return null;

  const result: ParsedQRData = {};
  for (const line of lines) {
    const match = line.match(/^([^=:]+)[=:](.+)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();

    if (['amount', 'total', 'sum', 'مبلغ', 'جمع'].includes(key)) {
      const num = parseFloat(value.replace(/,/g, ''));
      if (!isNaN(num) && num > 0) result.amount = num;
    }
    if (['date', 'تاریخ'].includes(key)) {
      if (/^\d{4}[/-]\d{2}[/-]\d{2}$/.test(value)) {
        result.date = value.replace(/\//g, '-');
      }
    }
    if (['taxid', 'tax_id', 'شناسه مالیاتی'].includes(key)) {
      result.taxId = value;
    }
    if (['merchant', 'store', 'فروشگاه'].includes(key)) {
      result.merchant = value;
    }
  }

  if (Object.keys(result).length === 0) return null;
  return result;
}
