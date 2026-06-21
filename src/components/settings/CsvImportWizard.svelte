<script lang="ts">
  import { get } from 'svelte/store';
  import { FileUp, ChevronLeft, ChevronRight, Check, AlertTriangle, User, FileText } from '@lucide/svelte';
  import { t, isRtl } from '$lib/i18n';
  import Modal from '../ui/Modal.svelte';
  import { parseCsv, type CsvRow, type CsvParseResult } from '$lib/utils/csv-parser';
  import { detectColumnMapping, getMappingCompleteness, type ColumnMapping } from '$lib/utils/csv-mapper';
  import {
    extractUniqueNames,
    extractUniqueCurrencies,
    getSymbolForCurrency,
    transformCsvToExpenses,
    type ParticipantMapping,
    type AmbiguousPayee,
    type ExtractedNames,
    type ImportResult
  } from '$lib/utils/csv-transformer';
  import { appData, updateData, importAsNewTrip } from '$lib/stores/data';
  import { showToast } from '$lib/stores/toast';
  import type { Participant, Currency } from '$lib/types';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let step = $state<1 | 2 | 3 | 4>(1);
  let csvResult = $state<CsvParseResult | null>(null);
  let mapping = $state<ColumnMapping>({
    date: null, description: null, amount: null, currency: null,
    payer: null, payee: null, entryType: null, id: null, flag: null, notes: null
  });
  let participantMappings = $state<ParticipantMapping[]>([]);
  let ambiguousPayees = $state<(AmbiguousPayee & { resolved: boolean; isPerson: boolean })[]>([]);
  let currencyMappings = $state<{ code: string; symbol: string; exists: boolean }[]>([]);
  let importResult = $state<ImportResult | null>(null);
  let importMode = $state<'merge' | 'new'>('merge');
  let newTripName = $state('');
  let dragOver = $state(false);

  const mappingFields: { key: keyof ColumnMapping; labelKey: string; required: boolean }[] = [
    { key: 'date', labelKey: 'csvImport.fields.date', required: true },
    { key: 'description', labelKey: 'csvImport.fields.description', required: true },
    { key: 'amount', labelKey: 'csvImport.fields.amount', required: true },
    { key: 'currency', labelKey: 'csvImport.fields.currency', required: false },
    { key: 'payer', labelKey: 'csvImport.fields.payer', required: false },
    { key: 'payee', labelKey: 'csvImport.fields.payee', required: false },
    { key: 'entryType', labelKey: 'csvImport.fields.entryType', required: false },
    { key: 'id', labelKey: 'csvImport.fields.id', required: false },
    { key: 'flag', labelKey: 'csvImport.fields.flag', required: false },
    { key: 'notes', labelKey: 'csvImport.fields.notes', required: false }
  ];

  function defaultTripName(): string {
    return get(t)('csvImport.defaultTripName');
  }

  function delimiterLabel(delimiter: string): string {
    const translate = get(t);
    if (delimiter === ',') return translate('csvImport.delimiterComma');
    if (delimiter === '\t') return translate('csvImport.delimiterTab');
    if (delimiter === ';') return translate('csvImport.delimiterSemicolon');
    return delimiter;
  }

  function reset() {
    step = 1;
    csvResult = null;
    mapping = { date: null, description: null, amount: null, currency: null, payer: null, payee: null, entryType: null, id: null, flag: null, notes: null };
    participantMappings = [];
    ambiguousPayees = [];
    currencyMappings = [];
    importResult = null;
    importMode = 'merge';
    newTripName = defaultTripName();
    dragOver = false;
  }

  $effect(() => {
    if (open && !newTripName) {
      newTripName = defaultTripName();
    }
  });

  function handleClose() {
    reset();
    onClose();
  }

  function handleFile(file: File) {
    if (!file.name.endsWith('.csv') && !file.type.includes('csv') && !file.type.includes('text')) {
      showToast($t('csvImport.selectCsvFile'), 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      csvResult = parseCsv(text);
      if (csvResult.headers.length === 0) {
        showToast($t('csvImport.parseFailed'), 'error');
        csvResult = null;
        return;
      }
      mapping = detectColumnMapping(csvResult.headers);
    };
    reader.readAsText(file);
  }

  function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  }

  function goToStep2() {
    if (!csvResult) return;
    step = 2;
  }

  function goToStep3() {
    if (!csvResult) return;
    const extracted: ExtractedNames = extractUniqueNames(csvResult.rows, mapping);
    const existing = $appData.participants;

    participantMappings = extracted.confirmed.map(name => {
      const match = existing.find(p =>
        p.name.toLowerCase() === name.toLowerCase() ||
        p.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(p.name.toLowerCase())
      );
      return {
        csvName: name,
        participantId: match?.id ?? null,
        createNew: !match,
        isDescription: false
      };
    });

    ambiguousPayees = extracted.ambiguous.map(ap => ({
      ...ap,
      resolved: false,
      isPerson: false
    }));

    const codes = extractUniqueCurrencies(csvResult.rows, mapping);
    const existingCodes = new Set($appData.currencies.map(c => c.code));

    currencyMappings = codes.map(code => ({
      code,
      symbol: getSymbolForCurrency(code),
      exists: existingCodes.has(code)
    }));

    step = 3;
  }

  function resolveAmbiguous(index: number, isPerson: boolean) {
    ambiguousPayees[index] = {
      ...ambiguousPayees[index],
      resolved: true,
      isPerson
    };
  }

  function goToStep4() {
    if (!csvResult) return;

    const allMappings: ParticipantMapping[] = [
      ...participantMappings,
      ...ambiguousPayees.map(ap => ({
        csvName: ap.name,
        participantId: null,
        createNew: ap.isPerson,
        isDescription: !ap.isPerson
      }))
    ];

    const newCurrencies = currencyMappings
      .filter(c => !c.exists)
      .map(c => ({ code: c.code, symbol: c.symbol }));

    importResult = transformCsvToExpenses(
      csvResult.rows,
      mapping,
      allMappings,
      $appData.participants,
      $appData.currencies,
      newCurrencies
    );

    step = 4;
  }

  function executeImport() {
    if (!importResult) return;

    const newParticipants: Participant[] = importResult.newParticipants.map(p => ({
      id: p.id,
      name: p.name
    }));

    const newCurrencies: Currency[] = importResult.newCurrencies
      .filter(c => !$appData.currencies.some(ec => ec.code === c.code))
      .map(c => ({ code: c.code, symbol: c.symbol }));

    if (importMode === 'merge') {
      updateData(d => ({
        ...d,
        participants: [...d.participants, ...newParticipants],
        currencies: [...d.currencies, ...newCurrencies],
        expenses: [...d.expenses, ...importResult!.expenses]
      }));
      showToast($t('csvImport.importedToTrip', { count: importResult.expenses.length }));
    } else {
      const data = {
        participants: [...$appData.participants, ...newParticipants],
        currencies: [...$appData.currencies, ...newCurrencies],
        expenses: importResult.expenses,
        exchangeRates: {},
        settlementCurrency: ''
      };
      importAsNewTrip(newTripName, data);
      showToast($t('csvImport.createdNewTrip', { name: newTripName, count: importResult.expenses.length }));
    }

    handleClose();
  }

  function updateParticipantMapping(index: number, participantId: string | null) {
    participantMappings[index] = {
      ...participantMappings[index],
      participantId,
      createNew: participantId === null,
      isDescription: false
    };
  }

  let previewRows = $derived(csvResult?.rows.slice(0, 5) ?? []);
  let mappingInfo = $derived(getMappingCompleteness(mapping));
  let allAmbiguousResolved = $derived(ambiguousPayees.length === 0 || ambiguousPayees.every(ap => ap.resolved));
</script>

<Modal open={open} title={$t('csvImport.title')} onClose={handleClose}>
  <div class="space-y-4">
    <!-- Step indicators -->
    <div class="flex items-center justify-center gap-1 mb-4">
      {#each [1, 2, 3, 4] as s}
        <div class="flex items-center">
          <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
            {s === step ? 'bg-primary-600 text-white' : s < step ? 'bg-primary-200 dark:bg-primary-800 text-primary-700 dark:text-primary-200' : 'bg-[#e2e8f0] dark:bg-[#334155] text-[var(--text-secondary)]'}">
            {#if s < step}
              <Check size={14} />
            {:else}
              {s}
            {/if}
          </div>
          {#if s < 4}
            <div class="w-6 h-0.5 mx-0.5 {s < step ? 'bg-primary-400' : 'bg-[#cbd5e1] dark:bg-[#475569]'}"></div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Step 1: Upload & Preview -->
    {#if step === 1}
      <div class="space-y-4">
        {#if !csvResult}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
              {dragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-[var(--card-border)] hover:border-primary-400'}"
            ondragover={(e) => { e.preventDefault(); dragOver = true; }}
            ondragleave={() => { dragOver = false; }}
            ondrop={handleDrop}
          >
            <FileUp size={40} class="mx-auto mb-3 text-[var(--text-secondary)]" />
            <p class="text-sm font-medium text-[var(--text-primary)] mb-1">{$t('csvImport.dropCsv')}</p>
            <p class="text-xs text-[var(--text-secondary)] mb-3">{$t('csvImport.orClickBrowse')}</p>
            <input
              type="file"
              accept=".csv,text/csv"
              onchange={handleFileInput}
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <label class="inline-block px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium cursor-pointer hover:bg-primary-500 transition-colors">
              {$t('csvImport.chooseFile')}
              <input type="file" accept=".csv,text/csv" onchange={handleFileInput} class="hidden" />
            </label>
          </div>
        {:else}
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-sm font-medium text-[var(--text-primary)]">
                {$t('csvImport.rowsFound', { count: csvResult.rowCount })}
              </p>
              <span class="text-xs px-2 py-0.5 rounded-full bg-[#e2e8f0] dark:bg-[#334155] text-[var(--text-secondary)]">
                {$t('csvImport.delimiter', { name: delimiterLabel(csvResult.delimiter) })}
              </span>
            </div>

            <div class="overflow-x-auto rounded-lg border border-[var(--card-border)]">
              <table class="w-full text-xs">
                <thead>
                  <tr class="bg-[#f1f5f9] dark:bg-[#1e293b]">
                    {#each csvResult.headers as header}
                      <th class="px-2 py-1.5 text-start font-medium text-[var(--text-secondary)] whitespace-nowrap">{header}</th>
                    {/each}
                  </tr>
                </thead>
                <tbody>
                  {#each previewRows as row, i}
                    <tr class="border-t border-[var(--card-border)] {i % 2 === 0 ? '' : 'bg-[#f8fafc] dark:bg-[#1e293b]/50'}">
                      {#each csvResult.headers as header}
                        <td class="px-2 py-1 text-[var(--text-primary)] whitespace-nowrap max-w-[150px] truncate">{row[header] || ''}</td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>

            <button
              onclick={() => { csvResult = null; }}
              class="text-xs text-primary-600 hover:text-primary-500 font-medium"
            >
              {$t('csvImport.chooseDifferentFile')}
            </button>
          </div>

          <button
            onclick={goToStep2}
            class="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
          >
            {$t('csvImport.nextColumnMapping')}
            <ChevronRight size={16} class={$isRtl ? 'rotate-180' : ''} />
          </button>
        {/if}
      </div>
    {/if}

    <!-- Step 2: Column Mapping -->
    {#if step === 2 && csvResult}
      <div class="space-y-4">
        <p class="text-xs text-[var(--text-secondary)]">
          {$t('csvImport.mapColumnsHint', { mapped: mappingInfo.mapped, total: mappingInfo.total })}
          {#if mappingInfo.missing.length > 0}
            <span class="text-danger-500"> {$t('csvImport.missingRequired', { fields: mappingInfo.missing.join(', ') })}</span>
          {/if}
        </p>

        <div class="space-y-2">
          {#each mappingFields as field}
            <div class="flex items-center gap-2">
              <label class="w-28 text-xs font-medium text-[var(--text-primary)] shrink-0">
                {$t(field.labelKey)}
                {#if field.required}<span class="text-danger-500">*</span>{/if}
              </label>
              <select
                value={mapping[field.key] ?? ''}
                onchange={(e) => { mapping[field.key] = (e.target as HTMLSelectElement).value || null; }}
                class="flex-1 px-2 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              >
                <option value="">{$t('csvImport.notMapped')}</option>
                {#each csvResult.headers as header}
                  <option value={header}>{header}</option>
                {/each}
              </select>
              {#if mapping[field.key]}
                <span class="text-xs text-[var(--text-secondary)] max-w-[100px] truncate" title={csvResult.rows[0]?.[mapping[field.key]!] ?? ''}>
                  {$t('csvImport.example', { value: csvResult.rows[0]?.[mapping[field.key]!] ?? '' })}
                </span>
              {/if}
            </div>
          {/each}
        </div>

        <div class="flex gap-2">
          <button
            onclick={() => { step = 1; }}
            class="flex-1 py-2.5 rounded-xl border border-[var(--card-border)] text-[var(--text-primary)] text-sm font-medium hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors flex items-center justify-center gap-1"
          >
            <ChevronLeft size={16} class={$isRtl ? 'rotate-180' : ''} /> {$t('csvImport.back')}
          </button>
          <button
            onclick={goToStep3}
            disabled={mappingInfo.missing.length > 0}
            class="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {$t('csvImport.next')} <ChevronRight size={16} class={$isRtl ? 'rotate-180' : ''} />
          </button>
        </div>
      </div>
    {/if}

    <!-- Step 3: Participant & Currency Mapping -->
    {#if step === 3}
      <div class="space-y-4">
        <!-- Confirmed participants (from payer column) -->
        {#if participantMappings.length > 0}
          <div>
            <div class="flex items-center gap-1.5 mb-2">
              <div class="w-2 h-2 rounded-full bg-green-500"></div>
              <h4 class="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">{$t('csvImport.confirmedParticipants', { count: participantMappings.length })}</h4>
            </div>
            <p class="text-xs text-[var(--text-secondary)] mb-2">{$t('csvImport.confirmedParticipantsHint')}</p>
            <div class="space-y-1.5 max-h-[180px] overflow-y-auto">
              {#each participantMappings as pm, i}
                <div class="flex items-center gap-2 p-1.5 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30">
                  <User size={14} class="text-green-600 dark:text-green-400 shrink-0" />
                  <span class="w-28 text-xs text-[var(--text-primary)] truncate shrink-0" title={pm.csvName}>{pm.csvName}</span>
                  <select
                    value={pm.participantId ?? '__new__'}
                    onchange={(e) => {
                      const val = (e.target as HTMLSelectElement).value;
                      updateParticipantMapping(i, val === '__new__' ? null : val);
                    }}
                    class="flex-1 px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                  >
                    <option value="__new__">{$t('csvImport.createNew')}</option>
                    {#each $appData.participants as p}
                      <option value={p.id}>{p.name}</option>
                    {/each}
                  </select>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Ambiguous payees (needs user decision) -->
        {#if ambiguousPayees.length > 0}
          <div>
            <div class="flex items-center gap-1.5 mb-2">
              <div class="w-2 h-2 rounded-full bg-amber-500"></div>
              <h4 class="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">{$t('csvImport.needsReview', { count: ambiguousPayees.length })}</h4>
            </div>
            <p class="text-xs text-[var(--text-secondary)] mb-2">{$t('csvImport.needsReviewHint')}</p>
            <div class="space-y-2 max-h-[220px] overflow-y-auto">
              {#each ambiguousPayees as ap, i}
                <div class="p-2 rounded-lg border transition-colors
                  {ap.resolved
                    ? (ap.isPerson ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800' : 'bg-[#f1f5f9] dark:bg-[#1e293b] border-[var(--card-border)]')
                    : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'}">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-medium text-[var(--text-primary)]">{ap.name}</span>
                    {#if ap.resolved}
                      <span class="text-xs px-1.5 py-0.5 rounded-full {ap.isPerson ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-[#e2e8f0] dark:bg-[#334155] text-[var(--text-secondary)]'}">
                        {ap.isPerson ? $t('csvImport.person') : $t('csvImport.description')}
                      </span>
                    {/if}
                  </div>
                  <p class="text-xs text-[var(--text-secondary)] mb-1.5">
                    {$t('csvImport.occurrences', { count: ap.occurrences })} &middot; {ap.sampleEntryType} &middot; {ap.sampleAmount} {ap.sampleCurrency}
                  </p>
                  <div class="flex gap-1.5">
                    <button
                      onclick={() => resolveAmbiguous(i, true)}
                      class="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all
                        {ap.resolved && ap.isPerson
                          ? 'bg-green-600 text-white'
                          : 'border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/20'}"
                    >
                      <User size={12} /> {$t('csvImport.person')}
                    </button>
                    <button
                      onclick={() => resolveAmbiguous(i, false)}
                      class="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all
                        {ap.resolved && !ap.isPerson
                          ? 'bg-[#64748b] text-white'
                          : 'border border-[var(--card-border)] text-[var(--text-secondary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
                    >
                      <FileText size={12} /> {$t('csvImport.description')}
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Currencies -->
        {#if currencyMappings.length > 0}
          <div>
            <h4 class="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-2">{$t('csvImport.currencies')}</h4>
            <div class="space-y-1.5">
              {#each currencyMappings as cm, i}
                <div class="flex items-center gap-2">
                  <span class="w-12 text-xs font-mono text-[var(--text-primary)]">{cm.code}</span>
                  {#if cm.exists}
                    <span class="text-xs text-green-600 dark:text-green-400">{$t('csvImport.alreadyExists')}</span>
                  {:else}
                    <input
                      type="text"
                      bind:value={currencyMappings[i].symbol}
                      maxlength="5"
                      placeholder={$t('csvImport.symbolPlaceholder')}
                      class="w-16 px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                    />
                    <span class="text-xs text-amber-600 dark:text-amber-400">{$t('csvImport.willBeCreated')}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Navigation -->
        <div class="flex gap-2">
          <button
            onclick={() => { step = 2; }}
            class="flex-1 py-2.5 rounded-xl border border-[var(--card-border)] text-[var(--text-primary)] text-sm font-medium hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors flex items-center justify-center gap-1"
          >
            <ChevronLeft size={16} class={$isRtl ? 'rotate-180' : ''} /> {$t('csvImport.back')}
          </button>
          <button
            onclick={goToStep4}
            disabled={!allAmbiguousResolved}
            class="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {$t('csvImport.next')} <ChevronRight size={16} class={$isRtl ? 'rotate-180' : ''} />
          </button>
        </div>
        {#if !allAmbiguousResolved}
          <p class="text-xs text-amber-600 dark:text-amber-400 text-center">
            {$t('csvImport.resolveAllHint')}
          </p>
        {/if}
      </div>
    {/if}

    <!-- Step 4: Review & Confirm -->
    {#if step === 4 && importResult}
      <div class="space-y-4">
        <div class="grid grid-cols-3 gap-2">
          <div class="text-center p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <p class="text-lg font-bold text-green-700 dark:text-green-300">{importResult.expenses.length}</p>
            <p class="text-xs text-green-600 dark:text-green-400">{$t('csvImport.toImport')}</p>
          </div>
          <div class="text-center p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <p class="text-lg font-bold text-amber-700 dark:text-amber-300">{importResult.flaggedRows.length}</p>
            <p class="text-xs text-amber-600 dark:text-amber-400">{$t('csvImport.flagged')}</p>
          </div>
          <div class="text-center p-3 rounded-xl bg-[#f1f5f9] dark:bg-[#1e293b] border border-[var(--card-border)]">
            <p class="text-lg font-bold text-[var(--text-primary)]">{importResult.skippedRows.length}</p>
            <p class="text-xs text-[var(--text-secondary)]">{$t('csvImport.skipped')}</p>
          </div>
        </div>

        {#if importResult.newParticipants.length > 0}
          <div class="text-xs text-[var(--text-secondary)]">
            {$t('csvImport.newParticipants')} <span class="font-medium text-[var(--text-primary)]">{importResult.newParticipants.map(p => p.name).join(', ')}</span>
          </div>
        {/if}

        {#if importResult.newCurrencies.length > 0}
          <div class="text-xs text-[var(--text-secondary)]">
            {$t('csvImport.newCurrencies')} <span class="font-medium text-[var(--text-primary)]">{importResult.newCurrencies.map(c => `${c.code} (${c.symbol})`).join(', ')}</span>
          </div>
        {/if}

        {#if importResult.flaggedRows.length > 0}
          <details class="text-xs">
            <summary class="cursor-pointer font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle size={12} /> {$t('csvImport.viewFlaggedRows')}
            </summary>
            <div class="mt-2 max-h-[120px] overflow-y-auto space-y-1 ps-4">
              {#each importResult.flaggedRows as fr}
                <p class="text-[var(--text-secondary)]">
                  <span class="font-mono">{$t('csvImport.row', { row: fr.row })}</span>: {fr.flag} {fr.notes}
                </p>
              {/each}
            </div>
          </details>
        {/if}

        {#if importResult.skippedRows.length > 0}
          <details class="text-xs">
            <summary class="cursor-pointer font-medium text-[var(--text-secondary)]">{$t('csvImport.viewSkippedRows', { count: importResult.skippedRows.length })}</summary>
            <div class="mt-2 max-h-[120px] overflow-y-auto space-y-1 ps-4">
              {#each importResult.skippedRows as sr}
                <p class="text-[var(--text-secondary)]">
                  <span class="font-mono">{$t('csvImport.row', { row: sr.row })}</span>: {sr.reason}
                </p>
              {/each}
            </div>
          </details>
        {/if}

        <!-- Import mode -->
        <div class="space-y-2">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{$t('csvImport.importTo')}</h4>
          <div class="flex rounded-xl border border-[var(--card-border)] overflow-hidden">
            <button
              onclick={() => { importMode = 'merge'; }}
              class="flex-1 py-2 text-xs font-medium transition-all
                {importMode === 'merge' ? 'bg-primary-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
            >
              {$t('csvImport.currentTrip')}
            </button>
            <button
              onclick={() => { importMode = 'new'; }}
              class="flex-1 py-2 text-xs font-medium transition-all
                {importMode === 'new' ? 'bg-primary-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
            >
              {$t('csvImport.newTrip')}
            </button>
          </div>
          {#if importMode === 'new'}
            <input
              type="text"
              bind:value={newTripName}
              placeholder={$t('csvImport.tripNamePlaceholder')}
              class="w-full px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
          {/if}
        </div>

        <div class="flex gap-2">
          <button
            onclick={() => { step = 3; }}
            class="flex-1 py-2.5 rounded-xl border border-[var(--card-border)] text-[var(--text-primary)] text-sm font-medium hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors flex items-center justify-center gap-1"
          >
            <ChevronLeft size={16} class={$isRtl ? 'rotate-180' : ''} /> {$t('csvImport.back')}
          </button>
          <button
            onclick={executeImport}
            disabled={importResult.expenses.length === 0}
            class="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-green-700 hover:from-green-400 hover:to-green-600 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check size={16} /> {$t('csvImport.importExpenses', { count: importResult.expenses.length })}
          </button>
        </div>
      </div>
    {/if}
  </div>
</Modal>
