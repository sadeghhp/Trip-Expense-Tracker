export interface ColumnMapping {
  date: string | null;
  description: string | null;
  amount: string | null;
  currency: string | null;
  payer: string | null;
  payee: string | null;
  entryType: string | null;
  id: string | null;
  flag: string | null;
  notes: string | null;
}

const DATE_PATTERNS = ['date', 'date_text', 'transaction date', 'posted', 'value date', 'booking date', 'تاریخ'];
const DESC_PATTERNS = ['description', 'memo', 'narrative', 'payee', 'details', 'particulars', 'شرح', 'توضیحات'];
const AMOUNT_PATTERNS = ['amount', 'total', 'sum', 'value', 'مبلغ'];
const CURRENCY_PATTERNS = ['currency', 'ccy', 'cur', 'ارز'];
const PAYER_PATTERNS = ['payer', 'paid by', 'from', 'account holder', 'پرداخت کننده'];
const PAYEE_PATTERNS = ['payee', 'paid to', 'to', 'beneficiary', 'دریافت کننده'];
const ENTRY_TYPE_PATTERNS = ['entry_type', 'type', 'transaction type', 'نوع'];
const ID_PATTERNS = ['journal_id', 'id', 'transaction_id', 'reference', 'ref'];
const FLAG_PATTERNS = ['flag', 'status', 'warning'];
const NOTES_PATTERNS = ['notes', 'note', 'comment', 'remarks', 'یادداشت'];

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[\s_-]+/g, ' ');
}

function findMatch(headers: string[], patterns: string[]): string | null {
  for (const header of headers) {
    const h = normalize(header);
    for (const p of patterns) {
      if (h === p || h.includes(p)) return header;
    }
  }
  return null;
}

export function detectColumnMapping(headers: string[]): ColumnMapping {
  return {
    date: findMatch(headers, DATE_PATTERNS),
    description: findMatch(headers, DESC_PATTERNS),
    amount: findMatch(headers, AMOUNT_PATTERNS),
    currency: findMatch(headers, CURRENCY_PATTERNS),
    payer: findMatch(headers, PAYER_PATTERNS),
    payee: findMatch(headers, PAYEE_PATTERNS),
    entryType: findMatch(headers, ENTRY_TYPE_PATTERNS),
    id: findMatch(headers, ID_PATTERNS),
    flag: findMatch(headers, FLAG_PATTERNS),
    notes: findMatch(headers, NOTES_PATTERNS),
  };
}

export function getMappingCompleteness(mapping: ColumnMapping): { mapped: number; total: number; missing: string[] } {
  const required: (keyof ColumnMapping)[] = ['date', 'description', 'amount'];
  const optional: (keyof ColumnMapping)[] = ['currency', 'payer', 'payee', 'entryType', 'id', 'flag', 'notes'];

  const missing: string[] = [];
  let mapped = 0;
  const total = required.length + optional.length;

  for (const key of [...required, ...optional]) {
    if (mapping[key]) {
      mapped++;
    } else if (required.includes(key)) {
      missing.push(key);
    }
  }

  return { mapped, total, missing };
}
