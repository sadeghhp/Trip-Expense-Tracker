<script lang="ts">
  import { Plus, Pencil, Trash2, Coins, Check } from '@lucide/svelte';
  import { appData, updateData } from '$lib/stores/data';
  import { showToast } from '$lib/stores/toast';
  import { validateCurrencyCode, isCurrencyUsed } from '$lib/utils/validation';
  import { PREDEFINED_CURRENCIES } from '$lib/constants/currencies';
  import { t } from '$lib/i18n';
  import type { Currency, PredefinedCurrency } from '$lib/types';
  import Modal from '../ui/Modal.svelte';
  import ConfirmDialog from '../ui/ConfirmDialog.svelte';
  import EmptyState from '../layout/EmptyState.svelte';

  const predefined: PredefinedCurrency[] = PREDEFINED_CURRENCIES;

  let showForm = $state(false);
  let editingCode: string | null = $state(null);
  let codeInput = $state('');
  let symbolInput = $state('');
  let formError = $state('');
  let deleteConfirm: Currency | null = $state(null);

  function openAdd() {
    editingCode = null;
    codeInput = '';
    symbolInput = '';
    formError = '';
    showForm = true;
  }

  function openEdit(c: Currency) {
    editingCode = c.code;
    codeInput = c.code;
    symbolInput = c.symbol;
    formError = '';
    showForm = true;
  }

  function handleSave() {
    const code = codeInput.trim().toUpperCase();
    const symbol = symbolInput.trim();

    if (!code || !symbol) {
      formError = $t('validation.codeAndSymbolRequired');
      return;
    }
    if (code.length > 5 || symbol.length > 5) {
      formError = $t('validation.maxChars');
      return;
    }

    const existingCodes = $appData.currencies.map(c => c.code);
    const error = validateCurrencyCode(code, existingCodes, editingCode ?? undefined);
    if (error) {
      formError = $t(error.key, error.params);
      return;
    }

    if (editingCode) {
      const oldCode = editingCode;
      updateData(d => {
        const currencies = d.currencies.map(c => c.code === oldCode ? { code, symbol } : c);
        const expenses = d.expenses.map(e => e.currencyCode === oldCode ? { ...e, currencyCode: code } : e);
        const exchangeRates = { ...d.exchangeRates };
        if (oldCode !== code && exchangeRates[oldCode] !== undefined) {
          exchangeRates[code] = exchangeRates[oldCode];
          delete exchangeRates[oldCode];
        }
        const settlementCurrency = d.settlementCurrency === oldCode ? code : d.settlementCurrency;
        return { ...d, currencies, expenses, exchangeRates, settlementCurrency };
      });
      showToast($t('currencies.updated'));
    } else {
      updateData(d => ({
        ...d,
        currencies: [...d.currencies, { code, symbol }],
        settlementCurrency: d.settlementCurrency || code
      }));
      showToast($t('currencies.added'));
    }
    showForm = false;
  }

  function togglePredefined(pc: PredefinedCurrency) {
    const exists = $appData.currencies.find(c => c.code === pc.code);
    if (exists) {
      if (isCurrencyUsed(pc.code, $appData.expenses)) {
        showToast($t('currencies.usedInExpenses', { code: pc.code }), 'error');
        return;
      }
      updateData(d => {
        const currencies = d.currencies.filter(c => c.code !== pc.code);
        const exchangeRates = { ...d.exchangeRates };
        delete exchangeRates[pc.code];
        const settlementCurrency = d.settlementCurrency === pc.code
          ? (currencies[0]?.code || '')
          : d.settlementCurrency;
        return { ...d, currencies, exchangeRates, settlementCurrency };
      });
      showToast($t('currencies.removed', { code: pc.code }));
    } else {
      updateData(d => ({
        ...d,
        currencies: [...d.currencies, { code: pc.code, symbol: pc.symbol }],
        settlementCurrency: d.settlementCurrency || pc.code
      }));
      showToast($t('currencies.quickAdded', { code: pc.code }));
    }
  }

  function requestDelete(c: Currency) {
    if (isCurrencyUsed(c.code, $appData.expenses)) {
      showToast($t('currencies.cannotDelete'), 'error');
      return;
    }
    deleteConfirm = c;
  }

  function confirmDelete() {
    if (!deleteConfirm) return;
    const code = deleteConfirm.code;
    updateData(d => {
      const currencies = d.currencies.filter(c => c.code !== code);
      const exchangeRates = { ...d.exchangeRates };
      delete exchangeRates[code];
      const settlementCurrency = d.settlementCurrency === code
        ? (currencies[0]?.code || '')
        : d.settlementCurrency;
      return { ...d, currencies, exchangeRates, settlementCurrency };
    });
    showToast($t('currencies.deleted'));
    deleteConfirm = null;
  }

  function isAdded(code: string): boolean {
    return $appData.currencies.some(c => c.code === code);
  }
</script>

<div class="p-4 md:p-6 space-y-6">
  <!-- Quick-add grid -->
  <div>
    <h3 class="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">{$t('currencies.quickAdd')}</h3>
    <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
      {#each predefined as pc (pc.code)}
        {@const added = isAdded(pc.code)}
        <button
          onclick={() => togglePredefined(pc)}
          class="relative flex flex-col items-center gap-1 p-3 rounded-xl border transition-all active:scale-95
            {added
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 dark:border-primary-600'
              : 'border-[var(--card-border)] bg-[var(--card-bg)] hover:border-primary-300'}"
        >
          {#if added}
            <div class="absolute top-1 end-1">
              <Check size={12} class="text-primary-600 dark:text-primary-400" />
            </div>
          {/if}
          <span class="text-lg">{pc.symbol}</span>
          <span class="text-[10px] font-medium text-[var(--text-secondary)]">{pc.code}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Current currencies list -->
  {#if $appData.currencies.length === 0}
    <EmptyState
      icon={Coins}
      title={$t('currencies.noCurrenciesTitle')}
      description={$t('currencies.noCurrenciesDesc')}
    />
  {:else}
    <div>
      <h3 class="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">{$t('currencies.activeCurrencies')}</h3>
      <div class="space-y-2">
        {#each $appData.currencies as currency (currency.code)}
          <div class="flex items-center justify-between p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-primary-50 border border-primary-200 dark:bg-primary-900/30 dark:border-primary-700 flex items-center justify-center">
                <span class="text-base font-bold text-primary-600 dark:text-primary-300">{currency.symbol}</span>
              </div>
              <span class="text-base font-medium text-[var(--text-primary)]">{currency.code}</span>
            </div>
            <div class="flex gap-1">
              <button
                onclick={() => openEdit(currency)}
class="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] active:scale-90 transition-all"
              >
              <Pencil size={16} class="text-[var(--text-secondary)]" />
              </button>
              <button
                onclick={() => requestDelete(currency)}
                class="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-danger-500/10 active:scale-90 transition-all"
              >
                <Trash2 size={16} class="text-danger-500" />
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <button
    onclick={openAdd}
    class="fixed mobile-fab end-4 md:bottom-6 md:end-6 w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 hover:scale-105 text-white shadow-lg shadow-[var(--fab-shadow)] flex items-center justify-center transition-all active:scale-90"
  >
    <Plus size={24} />
  </button>
</div>

<Modal open={showForm} title={editingCode ? $t('currencies.editTitle') : $t('currencies.addTitle')} onClose={() => showForm = false}>
  <form onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="space-y-4">
    <div>
      <label for="code" class="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{$t('currencies.codeLabel')}</label>
      <input
        id="code"
        type="text"
        bind:value={codeInput}
        placeholder={$t('currencies.codePlaceholder')}
        maxlength="5"
        class="w-full px-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
        autofocus
      />
    </div>
    <div>
      <label for="symbol" class="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{$t('currencies.symbolLabel')}</label>
      <input
        id="symbol"
        type="text"
        bind:value={symbolInput}
        placeholder={$t('currencies.symbolPlaceholder')}
        maxlength="5"
        class="w-full px-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
      />
    </div>
    {#if formError}
      <p class="text-xs text-danger-500">{formError}</p>
    {/if}
    <button
      type="submit"
      class="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md"
    >
      {editingCode ? $t('currencies.update') : $t('currencies.addCurrency')}
    </button>
  </form>
</Modal>

<ConfirmDialog
  open={deleteConfirm !== null}
  title={$t('currencies.deleteTitle')}
  message={$t('currencies.deleteMessage', { code: deleteConfirm?.code ?? '' })}
  confirmLabel={$t('common.delete')}
  destructive={true}
  onConfirm={confirmDelete}
  onCancel={() => deleteConfirm = null}
/>
