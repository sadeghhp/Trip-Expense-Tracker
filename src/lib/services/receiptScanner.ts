import { getAISettings } from '../stores/aiSettings';
import type { ReceiptData } from '../types';

const RECEIPT_EXTRACTION_PROMPT = `Analyze this receipt image and extract the expense information.

Return only valid JSON. Do not include markdown, explanations, comments, or extra text.

Use this exact JSON structure:

{
  "title": "string",
  "date": "YYYY-MM-DD or null",
  "totalAmount": number,
  "currency": "ISO currency code or null",
  "merchant": "string or null",
  "category": "Food | Transport | Accommodation | Shopping | Entertainment | Other",
  "lineItems": [
    {
      "name": "string",
      "quantity": number,
      "amount": number
    }
  ],
  "tax": number or null,
  "tip": number or null,
  "confidence": number between 0 and 1,
  "notes": "string or null"
}

Rules:
- Use the final paid amount as totalAmount.
- If multiple totals exist, choose the final payable total.
- If the currency is not visible, infer it only if clearly obvious from the receipt. Otherwise return null.
- If the date is unclear, return null.
- Do not guess merchant or line items when unreadable.
- Keep title short and useful, such as "Lunch at Cafe Roma".`;

export function parseAndValidateReceiptJson(raw: string): ReceiptData {
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('receipt.errorInvalidJson');
  }

  if (typeof parsed.totalAmount !== 'number' || parsed.totalAmount <= 0) {
    throw new Error('receipt.errorNoAmount');
  }

  if (!parsed.title || typeof parsed.title !== 'string') {
    parsed.title = 'Receipt expense';
  }

  const result: ReceiptData = {
    title: String(parsed.title).slice(0, 200),
    date: typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
    totalAmount: Math.round(parsed.totalAmount * 100) / 100,
    currency: typeof parsed.currency === 'string' && parsed.currency.length >= 2 ? parsed.currency.toUpperCase() : null,
    merchant: typeof parsed.merchant === 'string' ? parsed.merchant : null,
    category: validateCategory(parsed.category),
    lineItems: Array.isArray(parsed.lineItems) ? parsed.lineItems.filter(isValidLineItem).map(normalizeLineItem) : [],
    tax: typeof parsed.tax === 'number' ? parsed.tax : null,
    tip: typeof parsed.tip === 'number' ? parsed.tip : null,
    confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
    notes: typeof parsed.notes === 'string' ? parsed.notes : null
  };

  return result;
}

const VALID_CATEGORIES = ['Food', 'Transport', 'Accommodation', 'Shopping', 'Entertainment', 'Other'];

function validateCategory(val: any): string | null {
  if (typeof val === 'string' && VALID_CATEGORIES.includes(val)) return val;
  return null;
}

function isValidLineItem(item: any): boolean {
  return item && typeof item.name === 'string' && typeof item.amount === 'number';
}

function normalizeLineItem(item: any): { name: string; quantity: number; amount: number } {
  return {
    name: String(item.name),
    quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
    amount: item.amount
  };
}

export async function analyzeReceipt(imageDataUrl: string): Promise<ReceiptData> {
  const settings = getAISettings();

  if (!settings.baseUrl || !settings.apiKey || !settings.model) {
    throw new Error('receipt.errorNoConfig');
  }

  if (imageDataUrl.length > 20_000_000) {
    throw new Error('receipt.errorImageTooLarge');
  }

  const systemPrompt = settings.customPrompt
    ? `${settings.customPrompt}\n\nYou are a receipt extraction assistant. Return only valid JSON.`
    : 'You are a receipt extraction assistant. Return only valid JSON.';

  const url = `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: RECEIPT_EXTRACTION_PROMPT },
            { type: 'image_url', image_url: { url: imageDataUrl } }
          ]
        }
      ],
      temperature: 0
    })
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw new Error('receipt.errorInvalidKey');
    if (status === 402) throw new Error('receipt.errorNoCredits');
    if (status === 429) throw new Error('receipt.errorRateLimit');
    throw new Error('receipt.errorGeneric');
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;

  if (!rawText) {
    throw new Error('receipt.errorEmptyResponse');
  }

  return parseAndValidateReceiptJson(rawText);
}
