<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { Users, Coins, Check, ChevronRight, ChevronLeft, Plus, X, ArrowLeft, ArrowRight } from '@lucide/svelte';
  import { appData, updateData, activeTrip, exitTrip } from '$lib/stores/data';
  import { showToast } from '$lib/stores/toast';
  import { t, isRtl } from '$lib/i18n';
  import { validateParticipantName, isParticipantUsed } from '$lib/utils/validation';
  import { recalculateExchangeRates } from '$lib/engine/settlement';
  import { WIZARD_CURRENCIES } from '$lib/constants/currencies';
  import { generateId } from '$lib/utils/id';
  import type { PredefinedCurrency } from '$lib/types';

  interface Props {
    onComplete: () => void;
  }

  let { onComplete }: Props = $props();

  const predefined: PredefinedCurrency[] = WIZARD_CURRENCIES;

  let step: 'people' | 'currencies' = $state(
    $appData.participants.length > 0 ? 'currencies' : 'people'
  );
  let nameInput = $state('');
  let formError = $state('');
  let showCustomCurrency = $state(false);
  let customCode = $state('');
  let customSymbol = $state('');
  let customError = $state('');

  let canProceed = $derived($appData.participants.length >= 1);
  let canFinish = $derived($appData.participants.length >= 1 && $appData.currencies.length >= 1);

  let flyDir = $derived($isRtl ? -1 : 1);

  function addPerson() {
    const name = nameInput.trim();
    if (!name) {
      formError = $t('validation.nameRequired');
      return;
    }

    const existingNames = $appData.participants.map(p => p.name);
    const error = validateParticipantName(name, existingNames);
    if (error) {
      formError = $t(error.key, error.params);
      return;
    }

    updateData(d => ({
      ...d,
      participants: [...d.participants, { id: generateId(), name }]
    }));
    nameInput = '';
    formError = '';
    showToast($t('wizard.added', { name }));
  }

  function removePerson(id: string) {
    if (isParticipantUsed(id, $appData.expenses)) {
      showToast($t('participants.cannotDelete'), 'error');
      return;
    }
    updateData(d => ({
      ...d,
      participants: d.participants.filter(p => p.id !== id)
    }));
  }

  function toggleCurrency(currency: PredefinedCurrency) {
    const exists = $appData.currencies.some(c => c.code === currency.code);
    if (exists) {
      updateData(d => {
        const currencies = d.currencies.filter(c => c.code !== currency.code);
        let exchangeRates = { ...d.exchangeRates };
        delete exchangeRates[currency.code];
        const oldSettlement = d.settlementCurrency || d.currencies[0]?.code || '';
        const settlementCurrency = oldSettlement === currency.code
          ? (currencies[0]?.code ?? '')
          : oldSettlement;
        if (oldSettlement === currency.code && settlementCurrency) {
          exchangeRates = recalculateExchangeRates(exchangeRates, oldSettlement, settlementCurrency);
          delete exchangeRates[currency.code];
        }
        return { ...d, currencies, exchangeRates, settlementCurrency };
      });
    } else {
      updateData(d => ({
        ...d,
        currencies: [...d.currencies, { code: currency.code, symbol: currency.symbol }],
        settlementCurrency: d.settlementCurrency || currency.code
      }));
    }
  }

  function addCustomCurrency() {
    const code = customCode.trim().toUpperCase();
    const symbol = customSymbol.trim();

    if (!code || !symbol) {
      customError = $t('validation.codeAndSymbolRequired');
      return;
    }
    if (code.length > 5 || symbol.length > 5) {
      customError = $t('validation.maxChars');
      return;
    }
    if ($appData.currencies.some(c => c.code === code)) {
      customError = $t('validation.currencyExists');
      return;
    }

    updateData(d => ({
      ...d,
      currencies: [...d.currencies, { code, symbol }],
      settlementCurrency: d.settlementCurrency || code
    }));
    customCode = '';
    customSymbol = '';
    customError = '';
    showCustomCurrency = false;
  }

  function nextStep() {
    step = 'currencies';
  }

  function prevStep() {
    step = 'people';
  }

  function finish() {
    if (canFinish) onComplete();
  }

  function isCurrencySelected(code: string): boolean {
    return $appData.currencies.some(c => c.code === code);
  }
</script>

<!-- Trip header -->
<div class="flex items-center gap-3 mb-5">
  <button
    onclick={() => exitTrip()}
    class="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
  >
    {#if $isRtl}<ArrowRight size={18} class="text-[var(--text-secondary)]" />{:else}<ArrowLeft size={18} class="text-[var(--text-secondary)]" />{/if}
  </button>
  <div class="flex-1 min-w-0">
    <h2 class="text-lg font-bold text-[var(--text-primary)] truncate">{$activeTrip?.name ?? ''}</h2>
    <p class="text-xs text-[var(--text-secondary)]">{$t('wizard.step', { current: step === 'people' ? 1 : 2, total: 2 })}</p>
  </div>
</div>

<section
  class="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-sm overflow-hidden"
>
  <!-- Progress indicator -->
  <div class="flex items-center justify-center gap-3 pt-5 pb-2">
    <div class="flex items-center gap-2">
      <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300
        {step === 'people' ? 'bg-primary-500 text-white scale-110' : 'bg-primary-500 text-white'}">
        {#if $appData.participants.length > 0 && step === 'currencies'}
          <Check size={14} strokeWidth={3} />
        {:else}
          1
        {/if}
      </div>
      <div class="w-8 h-0.5 rounded-full transition-colors duration-300
        {step === 'currencies' ? 'bg-primary-500' : 'bg-surface-200 dark:bg-surface-700'}"></div>
      <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300
        {step === 'currencies' ? 'bg-primary-500 text-white scale-110' : 'bg-surface-200 dark:bg-surface-700 text-[var(--text-secondary)]'}">
        2
      </div>
    </div>
  </div>

  <!-- Step content -->
  <div class="p-5 pt-3">
    {#key step}
      <div
        in:fly={{ x: step === 'currencies' ? 30 * flyDir : -30 * flyDir, duration: 220, delay: 50 }}
        out:fly={{ x: step === 'currencies' ? -30 * flyDir : 30 * flyDir, duration: 150 }}
      >
        {#if step === 'people'}
          <!-- Step 1: Add People -->
          <div class="text-center mb-5">
            <div class="w-12 h-12 mx-auto rounded-2xl bg-accent-50 dark:bg-accent-900/20 flex items-center justify-center mb-3">
              <Users size={22} class="text-accent-600 dark:text-accent-400" />
            </div>
            <h3 class="text-base font-semibold text-[var(--text-primary)]">{$t('wizard.addPeople')}</h3>
            <p class="text-sm text-[var(--text-secondary)] mt-1">{$t('wizard.addPeopleDesc')}</p>
          </div>

          <!-- Input -->
          <div class="flex gap-2 mb-3">
            <input
              type="text"
              bind:value={nameInput}
              onkeydown={(e) => { if (e.key === 'Enter') addPerson(); }}
              placeholder={$t('wizard.namePlaceholder')}
              class="flex-1 px-4 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all"
            />
            <button
              onclick={addPerson}
              class="px-4 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-all active:scale-95 shrink-0"
            >
              <Plus size={18} />
            </button>
          </div>

          {#if formError}
            <p class="text-xs text-danger-600 dark:text-danger-400 mb-3" transition:fade={{ duration: 150 }}>{formError}</p>
          {/if}

          <!-- Added people chips -->
          {#if $appData.participants.length > 0}
            <div class="flex flex-wrap gap-2 mb-5">
              {#each $appData.participants as person (person.id)}
                <span
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-sm font-medium text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-800/50"
                  in:fly={{ y: -10, duration: 200 }}
                >
                  {person.name}
                  <button
                    onclick={() => removePerson(person.id)}
                    class="w-4 h-4 rounded-full flex items-center justify-center hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </span>
              {/each}
            </div>
          {/if}

          <!-- Next button -->
          <button
            onclick={nextStep}
            disabled={!canProceed}
            class="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200
              {canProceed
                ? 'bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white shadow-sm active:scale-[0.98]'
                : 'bg-surface-100 dark:bg-surface-800 text-[var(--text-secondary)] cursor-not-allowed'}"
          >
            <span class="inline-flex items-center gap-1.5">
              {$appData.participants.length > 0 ? $t('common.next') : $t('common.skip')}
              {#if $isRtl}<ChevronLeft size={16} />{:else}<ChevronRight size={16} />{/if}
            </span>
          </button>

        {:else}
          <!-- Step 2: Choose Currencies -->
          <div class="text-center mb-5">
            <div class="w-12 h-12 mx-auto rounded-2xl bg-success-50 dark:bg-success-900/20 flex items-center justify-center mb-3">
              <Coins size={22} class="text-success-600 dark:text-success-500" />
            </div>
            <h3 class="text-base font-semibold text-[var(--text-primary)]">{$t('wizard.chooseCurrencies')}</h3>
            <p class="text-sm text-[var(--text-secondary)] mt-1">{$t('wizard.chooseCurrenciesDesc')}</p>
          </div>

          <!-- Currency grid -->
          <div class="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
            {#each predefined as currency (currency.code)}
              {@const selected = isCurrencySelected(currency.code)}
              <button
                onclick={() => toggleCurrency(currency)}
                class="relative flex flex-col items-center gap-0.5 p-3 rounded-xl border transition-all duration-200 active:scale-95
                  {selected
                    ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-700 ring-1 ring-primary-500/30'
                    : 'bg-[var(--app-bg)] border-[var(--card-border)] hover:border-primary-200 dark:hover:border-primary-800'}"
              >
                {#if selected}
                  <div class="absolute top-1 end-1" transition:fade={{ duration: 100 }}>
                    <Check size={12} class="text-primary-500" />
                  </div>
                {/if}
                <span class="text-lg font-medium {selected ? 'text-primary-600 dark:text-primary-400' : 'text-[var(--text-primary)]'}">{currency.symbol}</span>
                <span class="text-[10px] font-semibold tracking-wide {selected ? 'text-primary-600 dark:text-primary-400' : 'text-[var(--text-secondary)]'}">{currency.code}</span>
              </button>
            {/each}

            <!-- Custom currency button -->
            <button
              onclick={() => { showCustomCurrency = !showCustomCurrency; }}
              class="flex flex-col items-center gap-0.5 p-3 rounded-xl border border-dashed border-[var(--card-border)] hover:border-primary-300 dark:hover:border-primary-700 bg-[var(--app-bg)] transition-all active:scale-95"
            >
              <Plus size={18} class="text-[var(--text-secondary)]" />
              <span class="text-[10px] font-semibold tracking-wide text-[var(--text-secondary)]">{$t('wizard.customCurrency')}</span>
            </button>
          </div>

          <!-- Custom currency form -->
          {#if showCustomCurrency}
            <div class="mb-4 p-3 rounded-xl bg-surface-50 dark:bg-surface-800/50 border border-[var(--card-border)]" transition:fly={{ y: -10, duration: 200 }}>
              <div class="flex gap-2">
                <input
                  type="text"
                  bind:value={customCode}
                  placeholder={$t('currencies.codePlaceholder')}
                  maxlength="5"
                  class="flex-1 px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--app-bg)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:outline-none focus:ring-2 focus:ring-primary-500/50 uppercase"
                />
                <input
                  type="text"
                  bind:value={customSymbol}
                  placeholder={$t('currencies.symbolPlaceholder')}
                  maxlength="5"
                  class="w-20 px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--app-bg)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                />
                <button
                  onclick={addCustomCurrency}
                  class="px-3 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-all active:scale-95"
                >
                  <Plus size={16} />
                </button>
              </div>
              {#if customError}
                <p class="text-xs text-danger-600 dark:text-danger-400 mt-2">{customError}</p>
              {/if}
            </div>
          {/if}

          <!-- Navigation buttons -->
          <div class="flex gap-3">
            <button
              onclick={prevStep}
              class="flex-1 py-3 rounded-xl text-sm font-medium border border-[var(--card-border)] text-[var(--text-secondary)] hover:bg-surface-50 dark:hover:bg-surface-800 transition-all active:scale-[0.98]"
            >
              <span class="inline-flex items-center gap-1.5">
                {#if $isRtl}<ChevronRight size={16} />{:else}<ChevronLeft size={16} />{/if}
                {$t('common.back')}
              </span>
            </button>
            <button
              onclick={finish}
              disabled={!canFinish}
              class="flex-[2] py-3 rounded-xl text-sm font-semibold transition-all duration-200
                {canFinish
                  ? 'bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white shadow-sm active:scale-[0.98]'
                  : 'bg-surface-100 dark:bg-surface-800 text-[var(--text-secondary)] cursor-not-allowed'}"
            >
              {$t('wizard.done')}
            </button>
          </div>
        {/if}
      </div>
    {/key}
  </div>
</section>
