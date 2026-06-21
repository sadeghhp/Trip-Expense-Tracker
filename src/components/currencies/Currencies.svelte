<script lang="ts">
  import { Plus, Pencil, Trash2, Coins, Check } from '@lucide/svelte';
  import { appData, updateData } from '$lib/stores/data';
  import { validateCurrencyCode, isCurrencyUsed } from '$lib/utils/validation';
  import type { Currency, PredefinedCurrency } from '$lib/types';
  import Modal from '../ui/Modal.svelte';
  import ConfirmDialog from '../ui/ConfirmDialog.svelte';
  import EmptyState from '../layout/EmptyState.svelte';

  interface Props {
    showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  }

  let { showToast }: Props = $props();

  const predefined: PredefinedCurrency[] = [
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
    { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
    { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
    { code: 'IRR', symbol: '﷼', name: 'Iranian Rial' },
    { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
    { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
    { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
    { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
    { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
    { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
    { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
    { code: 'THB', symbol: '฿', name: 'Thai Baht' },
    { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
    { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
    { code: 'MXN', symbol: 'Mex$', name: 'Mexican Peso' },
    { code: 'GEL', symbol: '₾', name: 'Georgian Lari' },
    { code: 'AMD', symbol: '֏', name: 'Armenian Dram' },
    { code: 'IQD', symbol: 'ع.د', name: 'Iraqi Dinar' },
    { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee' },
  ];

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
      formError = 'Both code and symbol are required.';
      return;
    }
    if (code.length > 5 || symbol.length > 5) {
      formError = 'Maximum 5 characters each.';
      return;
    }

    const existingCodes = $appData.currencies.map(c => c.code);
    const error = validateCurrencyCode(code, existingCodes, editingCode ?? undefined);
    if (error) {
      formError = error;
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
      showToast('Currency updated');
    } else {
      updateData(d => ({
        ...d,
        currencies: [...d.currencies, { code, symbol }]
      }));
      showToast('Currency added');
    }
    showForm = false;
  }

  function togglePredefined(pc: PredefinedCurrency) {
    const exists = $appData.currencies.find(c => c.code === pc.code);
    if (exists) {
      if (isCurrencyUsed(pc.code, $appData.expenses)) {
        showToast(`Currency ${pc.code} is used in expenses and cannot be removed.`, 'error');
        return;
      }
      updateData(d => {
        const currencies = d.currencies.filter(c => c.code !== pc.code);
        const exchangeRates = { ...d.exchangeRates };
        delete exchangeRates[pc.code];
        const settlementCurrency = d.settlementCurrency === pc.code ? '' : d.settlementCurrency;
        return { ...d, currencies, exchangeRates, settlementCurrency };
      });
      showToast(`${pc.code} removed`);
    } else {
      updateData(d => ({
        ...d,
        currencies: [...d.currencies, { code: pc.code, symbol: pc.symbol }]
      }));
      showToast(`${pc.code} added`);
    }
  }

  function requestDelete(c: Currency) {
    if (isCurrencyUsed(c.code, $appData.expenses)) {
      showToast('Cannot delete: currency is used in expenses', 'error');
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
      const settlementCurrency = d.settlementCurrency === code ? '' : d.settlementCurrency;
      return { ...d, currencies, exchangeRates, settlementCurrency };
    });
    showToast('Currency deleted');
    deleteConfirm = null;
  }

  function isAdded(code: string): boolean {
    return $appData.currencies.some(c => c.code === code);
  }
</script>

<div class="p-4 md:p-6 space-y-6">
  <!-- Quick-add grid -->
  <div>
    <h3 class="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">Quick Add</h3>
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
            <div class="absolute top-1 right-1">
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
      title="No currencies added"
      description="Add currencies used during your trip using the quick-add buttons above or the custom form."
    />
  {:else}
    <div>
      <h3 class="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">Active Currencies</h3>
      <div class="space-y-2">
        {#each $appData.currencies as currency (currency.code)}
          <div class="flex items-center justify-between p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md hover:border-primary-200 dark:hover:border-primary-800 transition-all duration-200">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
                <span class="text-base font-medium">{currency.symbol}</span>
              </div>
              <span class="text-base font-medium text-[var(--text-primary)]">{currency.code}</span>
            </div>
            <div class="flex gap-1">
              <button
                onclick={() => openEdit(currency)}
                class="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-surface-100 dark:hover:bg-surface-800 active:scale-90 transition-all"
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
    class="fixed bottom-20 right-4 md:bottom-6 md:right-6 w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 hover:scale-105 text-white shadow-lg shadow-[var(--fab-shadow)] flex items-center justify-center transition-all active:scale-90"
  >
    <Plus size={24} />
  </button>
</div>

<Modal open={showForm} title={editingCode ? 'Edit Currency' : 'Add Custom Currency'} onClose={() => showForm = false}>
  <form onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="space-y-4">
    <div>
      <label for="code" class="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Code</label>
      <input
        id="code"
        type="text"
        bind:value={codeInput}
        placeholder="e.g. USD"
        maxlength="5"
        class="w-full px-4 py-3 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
        autofocus
      />
    </div>
    <div>
      <label for="symbol" class="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Symbol</label>
      <input
        id="symbol"
        type="text"
        bind:value={symbolInput}
        placeholder="e.g. $"
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
      {editingCode ? 'Update' : 'Add Currency'}
    </button>
  </form>
</Modal>

<ConfirmDialog
  open={deleteConfirm !== null}
  title="Delete Currency"
  message="Are you sure you want to delete {deleteConfirm?.code ?? ''}?"
  confirmLabel="Delete"
  destructive={true}
  onConfirm={confirmDelete}
  onCancel={() => deleteConfirm = null}
/>
