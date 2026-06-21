export interface Participant {
  id: string;
  name: string;
}

export interface Currency {
  code: string;
  symbol: string;
}

export interface Beneficiary {
  participantId: string;
  customAmount: number | null;
  customPercentage: number | null;
}

export type SplitType = 'equal' | 'custom' | 'percentage';

export interface AIMetadata {
  merchant: string | null;
  category: string | null;
  confidence: number;
  rawExtractedData: Record<string, any>;
}

export interface Expense {
  id: string;
  date: string;
  description: string;
  currencyCode: string;
  amount: number;
  paidBy: string;
  splitType: SplitType;
  beneficiaries: Beneficiary[];
  source?: 'manual' | 'receipt_ai';
  receiptImageId?: string;
  aiMetadata?: AIMetadata;
}

export interface AppData {
  participants: Participant[];
  currencies: Currency[];
  expenses: Expense[];
  exchangeRates: Record<string, number>;
  settlementCurrency: string;
}

export type CalendarType = 'gregorian' | 'jalali';
export type ThemeType = 'light' | 'dark';
export type LocaleType = 'en' | 'fa';

export interface AppSettings {
  calendar: CalendarType;
  theme: ThemeType;
  locale: LocaleType;
}

export interface BalanceEntry {
  paid: number;
  owed: number;
  net: number;
}

export type CurrencyBalances = Record<string, Record<string, BalanceEntry>>;

export interface UnifiedBalance {
  id: string;
  name: string;
  balance: number;
}

export interface SettlementTransaction {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

export interface Trip {
  id: string;
  name: string;
  description: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  data: AppData;
}

export interface AppState {
  trips: Trip[];
  activeTripId: string | null;
}

export type TabId = 'home' | 'participants' | 'currencies' | 'expenses' | 'balances' | 'settlement' | 'settings';

export interface PredefinedCurrency {
  code: string;
  symbol: string;
  name: string;
}

export interface ReceiptLineItem {
  name: string;
  quantity: number;
  amount: number;
}

export interface BarcodeResult {
  text: string;
  format: string;
}

export interface ReceiptData {
  title: string;
  date: string | null;
  totalAmount: number;
  currency: string | null;
  merchant: string | null;
  category: string | null;
  lineItems: ReceiptLineItem[];
  tax: number | null;
  tip: number | null;
  confidence: number;
  notes: string | null;
  barcodeData?: BarcodeResult[];
}

export interface AISettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  customPrompt: string;
}
