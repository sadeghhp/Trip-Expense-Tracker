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
const DESC_PATTERNS = ['description', 'memo', 'narrative', 'details', 'particulars', 'شرح', 'توضیحات'];
const AMOUNT_PATTERNS = ['amount', 'total', 'sum', 'value', 'مبلغ'];
const CURRENCY_PATTERNS = ['currency', 'ccy', 'cur', 'ارز'];
const PAYER_PATTERNS = ['payer', 'paid by', 'from', 'account holder', 'پرداخت کننده'];
const PAYEE_PATTERNS = ['payee', 'paid to', 'to', 'beneficiary', 'recipient', 'دریافت کننده'];
const ENTRY_TYPE_PATTERNS = ['entry_type', 'type', 'transaction type', 'نوع'];
const ID_PATTERNS = ['journal_id', 'id', 'transaction_id', 'reference', 'ref'];
const FLAG_PATTERNS = ['flag', 'status', 'warning'];
const NOTES_PATTERNS = ['notes', 'note', 'comment', 'remarks', 'یادداشت'];

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[\s_-]+/g, ' ');
}

function findMatch(headers: string[], patterns: string[], used: Set<string>): string | null {
  for (const header of headers) {
    if (used.has(header)) continue;
    const h = normalize(header);
    const words = h.split(' ');
    for (const raw of patterns) {
      const p = normalize(raw);
      if (h === p) return header;
      if (p.includes(' ')) {
        if (h.includes(p)) return header;
      } else {
        if (words.includes(p)) return header;
      }
    }
  }
  return null;
}

function claim(used: Set<string>, header: string | null): string | null {
  if (header) used.add(header);
  return header;
}

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const used = new Set<string>();

  const date = claim(used, findMatch(headers, DATE_PATTERNS, used));
  const description = claim(used, findMatch(headers, DESC_PATTERNS, used));
  const amount = claim(used, findMatch(headers, AMOUNT_PATTERNS, used));
  const currency = claim(used, findMatch(headers, CURRENCY_PATTERNS, used));
  const payer = claim(used, findMatch(headers, PAYER_PATTERNS, used));
  const payee = claim(used, findMatch(headers, PAYEE_PATTERNS, used));
  const entryType = claim(used, findMatch(headers, ENTRY_TYPE_PATTERNS, used));
  const id = claim(used, findMatch(headers, ID_PATTERNS, used));
  const flag = claim(used, findMatch(headers, FLAG_PATTERNS, used));
  const notes = claim(used, findMatch(headers, NOTES_PATTERNS, used));

  return { date, description, amount, currency, payer, payee, entryType, id, flag, notes };
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
