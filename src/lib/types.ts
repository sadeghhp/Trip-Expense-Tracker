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

export interface Expense {
  id: string;
  date: string;
  description: string;
  currencyCode: string;
  amount: number;
  paidBy: string;
  splitType: SplitType;
  beneficiaries: Beneficiary[];
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

export interface AppSettings {
  calendar: CalendarType;
  theme: ThemeType;
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
  createdAt: string;
  updatedAt: string;
  data: AppData;
}

export interface AppState {
  trips: Trip[];
  activeTripId: string | null;
}

export type TabId = 'participants' | 'currencies' | 'expenses' | 'balances' | 'settlement' | 'settings';

export interface PredefinedCurrency {
  code: string;
  symbol: string;
  name: string;
}
