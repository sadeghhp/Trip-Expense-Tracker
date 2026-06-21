<script lang="ts">
  import { X, Camera, Upload, RotateCcw, Sparkles, AlertCircle, Loader2, ShieldAlert, CheckCircle2 } from '@lucide/svelte';
  import { fly } from 'svelte/transition';
  import { appData, updateData } from '$lib/stores/data';
  import { showToast } from '$lib/stores/toast';
  import { getTodayISO } from '$lib/engine/calendar';
  import { generateId } from '$lib/utils/id';
  import { validateExpense } from '$lib/utils/validation';
  import { formatAmount } from '$lib/utils/format';
  import { analyzeReceipt } from '$lib/services/receiptScanner';
  import { getAISettings } from '$lib/stores/aiSettings';
  import { t } from '$lib/i18n';
  import type { Expense, Beneficiary, SplitType, ReceiptData } from '$lib/types';

  interface Props {
    onClose: () => void;
    onSaved: () => void;
  }

  let { onClose, onSaved }: Props = $props();

  type ScannerState = 'capture' | 'preview' | 'analyzing' | 'review' | 'error';

  let state: ScannerState = $state('capture');
  let imageDataUrl: string = $state('');
  let errorMessage: string = $state('');
  let receiptData: ReceiptData | null = $state(null);

  // Review form state
  let description = $state('');
  let date = $state(getTodayISO());
  let amount = $state('');
  let currencyCode = $state($appData.currencies[0]?.code ?? '');
  let paidBy = $state($appData.participants[0]?.id ?? '');
  let splitType: SplitType = $state('equal');
  let selectedBeneficiaries: Set<string> = $state(new Set($appData.participants.map(p => p.id)));
  let formError = $state('');
  let currencyMismatch = $state(false);
  let detectedCurrency = $state('');

  let beneficiaryCount = $derived(selectedBeneficiaries.size);
  let parsedAmount = $derived(parseFloat(amount) || 0);
  let equalPerPerson = $derived.by(() => {
    if (beneficiaryCount === 0 || parsedAmount <= 0) return '';
    const totalCents = Math.round(parsedAmount * 100);
    const perPerson = Math.floor(totalCents / beneficiaryCount) / 100;
    return formatAmount(perPerson);
  });

  let fileInput: HTMLInputElement | undefined = $state(undefined);

  function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('receipt.readError')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('receipt.readError')); };
      img.src = url;
    });
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      errorMessage = $t('receipt.invalidImage');
      state = 'error';
      return;
    }
    try {
      imageDataUrl = await compressImage(file);
      state = 'preview';
    } catch {
      errorMessage = $t('receipt.readError');
      state = 'error';
    }
  }

  function retake() {
    imageDataUrl = '';
    state = 'capture';
    if (fileInput) fileInput.value = '';
  }

  async function analyze() {
    const settings = getAISettings();
    if (!settings.baseUrl || !settings.apiKey || !settings.model) {
      errorMessage = $t('receipt.noApiConfig');
      state = 'error';
      return;
    }

    state = 'analyzing';
    try {
      receiptData = await analyzeReceipt(imageDataUrl);
      populateReviewForm(receiptData);
      state = 'review';
    } catch (err: unknown) {
      const key = err instanceof Error ? err.message : '';
      const translated = key ? $t(key) : '';
      errorMessage = (translated && translated !== key) ? translated : $t('receipt.errorDescription');
      state = 'error';
    }
  }

  function populateReviewForm(data: ReceiptData) {
    description = data.title || '';
    date = data.date || getTodayISO();
    amount = data.totalAmount.toString();

    if (data.currency) {
      const existing = $appData.currencies.find(c => c.code === data.currency);
      if (existing) {
        currencyCode = existing.code;
        currencyMismatch = false;
      } else {
        detectedCurrency = data.currency;
        currencyMismatch = true;
        currencyCode = $appData.currencies[0]?.code ?? '';
      }
    }

    paidBy = $appData.participants[0]?.id ?? '';
    splitType = 'equal';
    selectedBeneficiaries = new Set($appData.participants.map(p => p.id));
  }

  const COMMON_SYMBOLS: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', KRW: '₩',
    INR: '₹', IRR: '﷼', TRY: '₺', RUB: '₽', AED: 'د.إ', SAR: '﷼',
    CAD: 'C$', AUD: 'A$', CHF: 'CHF', BRL: 'R$', THB: '฿', MXN: '$'
  };

  function addDetectedCurrency() {
    if (!detectedCurrency) return;
    const symbol = COMMON_SYMBOLS[detectedCurrency] ?? detectedCurrency;
    updateData(d => ({
      ...d,
      currencies: [...d.currencies, { code: detectedCurrency, symbol }]
    }));
    currencyCode = detectedCurrency;
    currencyMismatch = false;
  }

  function toggleBeneficiary(pid: string) {
    const next = new Set(selectedBeneficiaries);
    if (next.has(pid)) next.delete(pid);
    else next.add(pid);
    selectedBeneficiaries = next;
  }

  function handleSave() {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      formError = $t('validation.amountPositive');
      return;
    }
    const amountNum = Math.round(parsed * 100) / 100;
    const beneficiaries: Beneficiary[] = [...selectedBeneficiaries].map(pid => ({
      participantId: pid,
      customAmount: null,
      customPercentage: null
    }));

    const expenseData: Expense = {
      id: generateId(),
      date,
      description: description.trim(),
      currencyCode,
      amount: amountNum,
      paidBy,
      splitType,
      beneficiaries,
      source: 'receipt_ai',
      aiMetadata: receiptData ? {
        merchant: receiptData.merchant,
        category: receiptData.category,
        confidence: receiptData.confidence,
        rawExtractedData: receiptData as any
      } : undefined
    };

    const error = validateExpense(expenseData, $appData);
    if (error) {
      formError = $t(error.key, error.params);
      return;
    }

    updateData(d => ({
      ...d,
      expenses: [...d.expenses, expenseData]
    }));
    onSaved();
  }

  function goManual() {
    onClose();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  transition:fly={{ duration: 150 }}
>
  <div
    class="w-full md:max-w-lg md:mx-4 bg-[var(--card-bg)] rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col"
    transition:fly={{ y: 100, duration: 250 }}
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)] shrink-0">
      <h2 class="text-lg font-semibold text-[var(--text-primary)]">{$t('receipt.scanReceipt')}</h2>
      <button onclick={onClose} class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors">
        <X size={18} />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-5 py-4">

      <!-- CAPTURE STATE -->
      {#if state === 'capture'}
        <div class="space-y-4">
          <div class="text-center py-8">
            <div class="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mx-auto mb-4">
              <Camera size={32} class="text-primary-600 dark:text-primary-400" />
            </div>
            <h3 class="text-base font-medium text-[var(--text-primary)] mb-1">{$t('receipt.takePhoto')}</h3>
            <p class="text-sm text-[var(--text-secondary)]">{$t('receipt.captureDescription')}</p>
          </div>

          <input
            bind:this={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            class="hidden"
            onchange={handleFileSelect}
          />

          <div class="grid grid-cols-2 gap-3">
            <button
              onclick={() => fileInput?.click()}
              class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-primary-300 dark:border-primary-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
            >
              <Camera size={24} class="text-primary-600 dark:text-primary-400" />
              <span class="text-sm font-medium text-primary-700 dark:text-primary-300">{$t('receipt.camera')}</span>
            </button>

            <button
              onclick={() => { if (fileInput) { fileInput.removeAttribute('capture'); fileInput.addEventListener('change', () => fileInput?.setAttribute('capture', 'environment'), { once: true }); fileInput.click(); } }}
              class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-[var(--card-border)] hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
            >
              <Upload size={24} class="text-[var(--text-secondary)]" />
              <span class="text-sm font-medium text-[var(--text-secondary)]">{$t('receipt.uploadImage')}</span>
            </button>
          </div>

          <!-- Privacy notice -->
          <div class="flex gap-2 p-3 rounded-xl bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800">
            <ShieldAlert size={16} class="text-warning-600 dark:text-warning-400 shrink-0 mt-0.5" />
            <p class="text-xs text-warning-700 dark:text-warning-300">{$t('receipt.privacyNotice')}</p>
          </div>
        </div>

      <!-- PREVIEW STATE -->
      {:else if state === 'preview'}
        <div class="space-y-4">
          <div class="relative rounded-xl overflow-hidden border border-[var(--card-border)]">
            <img src={imageDataUrl} alt="Receipt preview" class="w-full max-h-64 object-contain bg-[var(--app-bg)]" />
          </div>

          <div class="flex gap-3">
            <button
              onclick={retake}
              class="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-[var(--card-border)] text-sm font-medium text-[var(--text-primary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
            >
              <RotateCcw size={16} />
              {$t('receipt.retake')}
            </button>
            <button
              onclick={analyze}
              class="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-medium transition-all shadow-sm hover:shadow-md"
            >
              <Sparkles size={16} />
              {$t('receipt.analyze')}
            </button>
          </div>
        </div>

      <!-- ANALYZING STATE -->
      {:else if state === 'analyzing'}
        <div class="text-center py-12">
          <div class="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center mx-auto mb-4">
            <Loader2 size={32} class="text-primary-600 dark:text-primary-400 animate-spin" />
          </div>
          <h3 class="text-base font-medium text-[var(--text-primary)] mb-1">{$t('receipt.analyzing')}</h3>
          <p class="text-sm text-[var(--text-secondary)]">{$t('receipt.analyzingDescription')}</p>
        </div>

      <!-- ERROR STATE -->
      {:else if state === 'error'}
        <div class="text-center py-8 space-y-4">
          <div class="w-16 h-16 rounded-2xl bg-danger-50 dark:bg-danger-900/20 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} class="text-danger-500" />
          </div>
          <h3 class="text-base font-medium text-[var(--text-primary)]">{$t('receipt.errorTitle')}</h3>
          <p class="text-sm text-[var(--text-secondary)] max-w-sm mx-auto">{errorMessage}</p>

          <div class="flex gap-3 pt-2">
            <button
              onclick={retake}
              class="flex-1 py-3 px-4 rounded-xl border border-[var(--card-border)] text-sm font-medium text-[var(--text-primary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
            >
              {$t('receipt.tryAgain')}
            </button>
            <button
              onclick={goManual}
              class="flex-1 py-3 px-4 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors"
            >
              {$t('receipt.addManually')}
            </button>
          </div>
        </div>

      <!-- REVIEW STATE -->
      {:else if state === 'review'}
        <div class="space-y-4">
          <!-- Confidence badge -->
          {#if receiptData}
            <div class="flex items-center gap-2 px-3 py-2 rounded-xl {receiptData.confidence >= 0.8 ? 'bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800' : 'bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800'}">
              <CheckCircle2 size={16} class={receiptData.confidence >= 0.8 ? 'text-success-600 dark:text-success-400' : 'text-warning-600 dark:text-warning-400'} />
              <span class="text-xs {receiptData.confidence >= 0.8 ? 'text-success-700 dark:text-success-300' : 'text-warning-700 dark:text-warning-300'}">
                {$t('receipt.reviewDescription')} ({Math.round(receiptData.confidence * 100)}% {$t('receipt.confidence')})
              </span>
            </div>
          {/if}

          <!-- Currency mismatch warning -->
          {#if currencyMismatch}
            <div class="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800">
              <span class="text-xs text-warning-700 dark:text-warning-300">{$t('receipt.currencyNotInTrip', { currency: detectedCurrency })}</span>
              <button
                onclick={addDetectedCurrency}
                class="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline whitespace-nowrap"
              >
                {$t('receipt.addCurrency')}
              </button>
            </div>
          {/if}

          <!-- Review form -->
          <form onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('expenseForm.description')}</label>
              <input type="text" bind:value={description}
                class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('expenseForm.date')}</label>
                <input type="date" bind:value={date}
                  class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
              </div>
              <div>
                <label class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('expenseForm.currency')}</label>
                <select bind:value={currencyCode}
                  class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
                  {#each $appData.currencies as c}
                    <option value={c.code}>{c.symbol} {c.code}</option>
                  {/each}
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('expenseForm.amount')}</label>
                <input type="number" bind:value={amount} step="0.01" min="0"
                  class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
              </div>
              <div>
                <label class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('expenseForm.paidBy')}</label>
                <select bind:value={paidBy}
                  class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
                  {#each $appData.participants as p}
                    <option value={p.id}>{p.name}</option>
                  {/each}
                </select>
              </div>
            </div>

            <!-- Split type -->
            <div>
              <label class="block text-xs font-medium text-[var(--text-secondary)] mb-2">{$t('expenseForm.splitType')}</label>
              <div class="flex rounded-xl border border-[var(--card-border)] overflow-hidden">
                {#each ['equal', 'custom', 'percentage'] as st}
                  <button
                    type="button"
                    onclick={() => splitType = st as SplitType}
                    class="flex-1 py-2 text-xs font-medium transition-all
                      {splitType === st
                        ? 'bg-primary-600 text-white'
                        : 'bg-[var(--app-bg)] text-[var(--text-secondary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
                  >
                    {$t(`expenseForm.${st}`)}
                  </button>
                {/each}
              </div>
            </div>

            <!-- Beneficiaries -->
            <div>
              <label class="block text-xs font-medium text-[var(--text-secondary)] mb-2">
                {$t('expenseForm.beneficiaries', { count: beneficiaryCount })}
              </label>
              <div class="space-y-2 max-h-36 overflow-y-auto">
                {#each $appData.participants as p (p.id)}
                  {@const selected = selectedBeneficiaries.has(p.id)}
                  <div class="flex items-center gap-3 p-2 rounded-xl {selected ? 'bg-primary-50 dark:bg-primary-900/20' : ''}">
                    <button
                      type="button"
                      onclick={() => toggleBeneficiary(p.id)}
                      class="w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all
                        {selected ? 'border-primary-600 bg-primary-600' : 'border-[var(--card-border)]'}"
                    >
                      {#if selected}
                        <svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      {/if}
                    </button>
                    <span class="text-sm text-[var(--text-primary)]">{p.name}</span>
                  </div>
                {/each}
              </div>
            </div>

            <!-- Equal split preview -->
            {#if splitType === 'equal' && beneficiaryCount > 0 && parsedAmount > 0}
              <div class="px-3 py-2 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 text-xs text-primary-700 dark:text-primary-300">
                {$t('expenseForm.equalPreview', { amount: equalPerPerson, count: beneficiaryCount, label: beneficiaryCount === 1 ? $t('common.person') : $t('common.people') })}
              </div>
            {/if}

            {#if formError}
              <p class="text-xs text-danger-500 px-1">{formError}</p>
            {/if}

            <button
              type="submit"
              class="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md"
            >
              {$t('receipt.saveExpense')}
            </button>
          </form>
        </div>
      {/if}

    </div>
  </div>
</div>
