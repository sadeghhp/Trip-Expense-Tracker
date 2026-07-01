import type { AppData, AppState, Expense, CsvJournalEntry, JournalEntry, JournalStatus } from '../types';

const JOURNAL_STATUSES: JournalStatus[] = ['applied', 'pending', 'error', 'out_of_sync'];

function normalizeJournalEntries(raw: any, expenseIds: Set<string>): CsvJournalEntry[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  const entries: CsvJournalEntry[] = [];
  for (const j of raw) {
    if (typeof j?.journalId !== 'string' || !j.journalId) continue;
    const status = j.status;
    if (status !== 'imported' && status !== 'skipped' && status !== 'flagged') continue;

    const amount = Number(j.amount);
    const linkedId = typeof j.linkedExpenseId === 'string' && expenseIds.has(j.linkedExpenseId)
      ? j.linkedExpenseId
      : null;

    entries.push({
      journalId: j.journalId,
      entryId: typeof j.entryId === 'string' ? j.entryId : '',
      sourceFile: typeof j.sourceFile === 'string' ? j.sourceFile : '',
      entryType: typeof j.entryType === 'string' ? j.entryType : '',
      date: typeof j.date === 'string' ? j.date : '',
      description: typeof j.description === 'string' ? j.description : '',
      payer: typeof j.payer === 'string' ? j.payer : '',
      payee: typeof j.payee === 'string' ? j.payee : '',
      currency: typeof j.currency === 'string' ? j.currency : '',
      amount: Number.isFinite(amount) ? amount : 0,
      flag: typeof j.flag === 'string' ? j.flag : '',
      notes: typeof j.notes === 'string' ? j.notes : '',
      localNotes: typeof j.localNotes === 'string' ? j.localNotes : '',
      linkedExpenseId: linkedId,
      status,
      skipReason: typeof j.skipReason === 'string' ? j.skipReason : ''
    });
  }

  return entries.length > 0 ? entries : undefined;
}

function normalizeJournals(raw: any, expenseIds: Set<string>): JournalEntry[] {
  if (!Array.isArray(raw)) return [];

  const entries: JournalEntry[] = [];
  for (const j of raw) {
    if (typeof j?.id !== 'string' || !j.id) continue;
    const status = j.status;
    if (!JOURNAL_STATUSES.includes(status)) continue;

    const amount = Number(j.amount);
    const expenseId = typeof j.expenseId === 'string' && expenseIds.has(j.expenseId)
      ? j.expenseId
      : null;

    entries.push({
      id: j.id,
      journalId: typeof j.journalId === 'string' ? j.journalId : null,
      rawData: (j.rawData && typeof j.rawData === 'object' && !Array.isArray(j.rawData))
        ? j.rawData as Record<string, string>
        : {},
      date: typeof j.date === 'string' ? j.date : '',
      description: typeof j.description === 'string' ? j.description : '',
      amount: Number.isFinite(amount) ? amount : 0,
      currencyCode: typeof j.currencyCode === 'string' ? j.currencyCode : '',
      payerName: typeof j.payerName === 'string' ? j.payerName : '',
      payeeName: typeof j.payeeName === 'string' ? j.payeeName : '',
      entryType: typeof j.entryType === 'string' ? j.entryType : '',
      notes: typeof j.notes === 'string' ? j.notes : undefined,
      flag: typeof j.flag === 'string' ? j.flag : undefined,
      status,
      skipReason: typeof j.skipReason === 'string' ? j.skipReason : undefined,
      expenseId,
      importBatchId: typeof j.importBatchId === 'string' ? j.importBatchId : undefined,
      updatedAt: typeof j.updatedAt === 'string' ? j.updatedAt : new Date().toISOString()
    });
  }

  return entries;
}

function normalizePendingImports(raw: any): AppData['pendingImports'] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((p: any) => typeof p?.id === 'string' && p.rawData && typeof p.reason === 'string')
    .map((p: any) => ({
      id: p.id,
      rawData: p.rawData as Record<string, string>,
      reason: p.reason,
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString(),
      date: typeof p.date === 'string' ? p.date : undefined,
      description: typeof p.description === 'string' ? p.description : undefined,
      amount: typeof p.amount === 'number' ? p.amount : undefined,
      currencyCode: typeof p.currencyCode === 'string' ? p.currencyCode : undefined,
      payerName: typeof p.payerName === 'string' ? p.payerName : undefined,
      payeeName: typeof p.payeeName === 'string' ? p.payeeName : undefined,
      entryType: typeof p.entryType === 'string' ? p.entryType : undefined
    }));
}

export function normalizeData(raw: any): AppData {
  const participants = Array.isArray(raw?.participants) ? raw.participants : [];
  const currencies = Array.isArray(raw?.currencies) ? raw.currencies : [];
  let expenses = Array.isArray(raw?.expenses) ? raw.expenses : [];
  const exchangeRates = (raw?.exchangeRates && typeof raw.exchangeRates === 'object' && !Array.isArray(raw.exchangeRates))
    ? raw.exchangeRates : {};
  let settlementCurrency = typeof raw?.settlementCurrency === 'string' ? raw.settlementCurrency : '';

  const validParticipants = participants.filter(
    (p: any) => typeof p?.id === 'string' && typeof p?.name === 'string'
  );

  const validCurrencies = currencies.filter(
    (c: any) => typeof c?.code === 'string' && typeof c?.symbol === 'string'
  );

  const participantIds = new Set(validParticipants.map((p: any) => p.id));
  const currencyCodes = new Set(validCurrencies.map((c: any) => c.code));

  // First filter: must have id and beneficiaries array
  expenses = expenses.filter(
    (e: any) => typeof e?.id === 'string' && Array.isArray(e?.beneficiaries)
  );

  // Filter beneficiaries, normalize splitType, and coerce numeric fields
  expenses = expenses.map((e: any) => {
    const filteredBeneficiaries = e.beneficiaries
      .filter(
        (b: any) => typeof b?.participantId === 'string' && participantIds.has(b.participantId)
      )
      .map((b: any) => ({
        ...b,
        customAmount: typeof b.customAmount === 'number' && Number.isFinite(b.customAmount) ? b.customAmount : null,
        customPercentage: typeof b.customPercentage === 'number' && Number.isFinite(b.customPercentage) ? b.customPercentage : null,
      }));
    const splitType = ['equal', 'custom', 'percentage'].includes(e.splitType) ? e.splitType : 'equal';
    const amount = Number(e.amount);
    const isTreat = e.isTreat === true ? true : undefined;
    const { isTreat: _omitTreat, ...expenseRest } = e;
    return {
      ...expenseRest,
      amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
      beneficiaries: filteredBeneficiaries,
      splitType,
      ...(isTreat ? { isTreat } : {})
    };
  });

  // Second filter: referential integrity + valid amount
  expenses = expenses.filter(
    (e: any) =>
      participantIds.has(e.paidBy) &&
      currencyCodes.has(e.currencyCode) &&
      e.beneficiaries.length > 0 &&
      e.amount > 0
  );

  // Clean exchange rates
  const cleanedRates: Record<string, number> = {};
  for (const [code, rate] of Object.entries(exchangeRates)) {
    if (currencyCodes.has(code) && typeof rate === 'number' && rate > 0) {
      cleanedRates[code] = rate;
    }
  }

  // Clean settlement currency
  if (!currencyCodes.has(settlementCurrency)) {
    settlementCurrency = '';
  }

  const expenseIds = new Set(expenses.map((e: any) => e.id));
  const journalEntries = normalizeJournalEntries(raw?.journalEntries, expenseIds);
  const journals = normalizeJournals(raw?.journals, expenseIds);
  const pendingImports = normalizePendingImports(raw?.pendingImports);

  const tankhahParticipantId =
    typeof raw?.tankhahParticipantId === 'string' && participantIds.has(raw.tankhahParticipantId)
      ? raw.tankhahParticipantId
      : undefined;

  return {
    participants: validParticipants,
    currencies: validCurrencies,
    expenses,
    journals,
    pendingImports,
    exchangeRates: cleanedRates,
    settlementCurrency,
    ...(tankhahParticipantId ? { tankhahParticipantId } : {}),
    ...(journalEntries ? { journalEntries } : {})
  };
}

export function normalizeAppState(raw: any): AppState {
  const trips = Array.isArray(raw?.trips) ? raw.trips : [];
  const activeTripId = typeof raw?.activeTripId === 'string' ? raw.activeTripId : null;

  const validTrips = trips
    .filter((t: any) => typeof t?.id === 'string' && typeof t?.name === 'string' && t?.data)
    .map((t: any) => ({
      id: t.id,
      name: t.name,
      description: typeof t.description === 'string' ? t.description : '',
      archived: typeof t.archived === 'boolean' ? t.archived : false,
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
      updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : new Date().toISOString(),
      data: normalizeData(t.data)
    }));

  const deduped = new Map<string, (typeof validTrips)[0]>();
  for (const trip of validTrips) {
    deduped.set(trip.id, trip);
  }
  const uniqueTrips = [...deduped.values()];

  const validIds = new Set(uniqueTrips.map((t: any) => t.id));

  return {
    trips: uniqueTrips,
    activeTripId: activeTripId && validIds.has(activeTripId) ? activeTripId : null
  };
}

export function stripReceiptImageIds(data: AppData): AppData {
  return {
    ...data,
    expenses: data.expenses.map((e: Expense) => {
      if (!e.receiptImageId) return e;
      const { receiptImageId, ...rest } = e;
      return rest;
    })
  };
}
