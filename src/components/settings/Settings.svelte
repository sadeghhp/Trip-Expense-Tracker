<script lang="ts">
  import { Sun, Moon, Calendar, Download, Upload, Trash2, FileSpreadsheet, FileUp, DatabaseBackup, Database, Info, Sparkles, Eye, EyeOff, RefreshCw } from '@lucide/svelte';
  import { settings, setCalendar, toggleTheme, setAppLocale } from '$lib/stores/settings';
  import { aiSettings, updateAISettings, testConnection } from '$lib/stores/aiSettings';
  import { showToast } from '$lib/stores/toast';
  import { replaceData, clearAllData, getSnapshot, activeTrip, importAsNewTrip, getFullSnapshot, replaceAllData } from '$lib/stores/data';
  import { getTodayForCalendar } from '$lib/engine/calendar';
  import { t, isRtl } from '$lib/i18n';
  import ConfirmDialog from '../ui/ConfirmDialog.svelte';
  import Modal from '../ui/Modal.svelte';
  import CsvImportWizard from './CsvImportWizard.svelte';

  let clearConfirm = $state(false);
  let importOpen = $state(false);
  let importText = $state('');
  let importConfirm = $state(false);
  let importError = $state('');
  let importMode: 'replace' | 'new' = $state('replace');
  let parsedImportData: any = $state(null);
  let csvImportOpen = $state(false);
  let dragOver = $state(false);
  let loadedFileName = $state('');
  let backupImportOpen = $state(false);
  let backupImportText = $state('');
  let backupImportError = $state('');
  let backupImportConfirm = $state(false);
  let backupDragOver = $state(false);
  let backupLoadedFileName = $state('');

  let showApiKey = $state(false);
  let aiTestLoading = $state(false);
  let hardReloading = $state(false);

  function handleJsonFile(file: File) {
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      importError = $t('validation.pleaseSelectJson');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      importText = reader.result as string;
      loadedFileName = file.name;
      importError = '';
    };
    reader.onerror = () => {
      importError = $t('validation.failedToRead');
    };
    reader.readAsText(file);
  }

  function handleJsonFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) handleJsonFile(file);
    input.value = '';
  }

  function handleJsonDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) handleJsonFile(file);
  }

  function handleExport() {
    const data = getSnapshot();
    const trip = $activeTrip;
    const exportPayload = {
      tripName: trip?.name ?? 'Untitled',
      tripDescription: trip?.description ?? '',
      ...data
    };
    const json = JSON.stringify(exportPayload, null, 2);
    const dateStr = getTodayForCalendar($settings.calendar);
    const tripSlug = (trip?.name ?? 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `${tripSlug}-${dateStr}.json`;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast($t('settings.dataExported'));
  }

  function handleImportPaste() {
    importError = '';
    try {
      const parsed = JSON.parse(importText);
      if (!parsed || typeof parsed !== 'object') throw new Error($t('validation.invalidJsonObject'));
      if (!Array.isArray(parsed.participants)) throw new Error($t('validation.missingParticipants'));
      if (!Array.isArray(parsed.currencies)) throw new Error($t('validation.missingCurrencies'));
      if (!Array.isArray(parsed.expenses)) throw new Error($t('validation.missingExpenses'));
      parsedImportData = parsed;
      importConfirm = true;
    } catch (e: any) {
      importError = e.message || $t('validation.invalidJson');
    }
  }

  function confirmImport() {
    if (!parsedImportData) return;
    try {
      if (importMode === 'new') {
        const name = parsedImportData.tripName || 'Imported Trip';
        const desc = parsedImportData.tripDescription || '';
        importAsNewTrip(name, parsedImportData, desc);
        showToast($t('settings.importedAsNew'));
      } else {
        replaceData(parsedImportData);
        showToast($t('settings.importedIntoCurrent'));
      }
      importOpen = false;
      importText = '';
      importConfirm = false;
      parsedImportData = null;
      loadedFileName = '';
    } catch (e: any) {
      showToast($t('settings.importFailed', { message: e.message }), 'error');
    }
  }

  function handleExportAll() {
    const state = getFullSnapshot();
    const json = JSON.stringify(state, null, 2);
    const dateStr = getTodayForCalendar($settings.calendar);
    const filename = `trip-expense-backup-${dateStr}.json`;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast($t('settings.fullBackupExported'));
  }

  function handleBackupFile(file: File) {
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      backupImportError = $t('validation.pleaseSelectJson');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      backupImportText = reader.result as string;
      backupLoadedFileName = file.name;
      backupImportError = '';
    };
    reader.onerror = () => {
      backupImportError = $t('validation.failedToRead');
    };
    reader.readAsText(file);
  }

  function handleBackupFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) handleBackupFile(file);
    input.value = '';
  }

  function handleBackupDrop(e: DragEvent) {
    e.preventDefault();
    backupDragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) handleBackupFile(file);
  }

  function handleBackupValidate() {
    backupImportError = '';
    try {
      const parsed = JSON.parse(backupImportText);
      if (!parsed || typeof parsed !== 'object') throw new Error($t('validation.invalidJsonObject'));
      if (!Array.isArray(parsed.trips)) throw new Error($t('validation.missingTripsArray'));
      backupImportConfirm = true;
    } catch (e: any) {
      backupImportError = e.message || $t('validation.invalidJson');
    }
  }

  function confirmBackupImport() {
    try {
      const parsed = JSON.parse(backupImportText);
      replaceAllData(parsed);
      showToast($t('settings.backupRestored'));
      backupImportOpen = false;
      backupImportText = '';
      backupImportConfirm = false;
      backupLoadedFileName = '';
    } catch (e: any) {
      showToast($t('settings.restoreFailed', { message: e.message }), 'error');
    }
  }

  function handleClear() {
    clearAllData();
    showToast($t('settings.tripDataCleared'));
    clearConfirm = false;
  }

  const templateJson = `{
  "tripName": "My Trip",
  "tripDescription": "Optional description",
  "participants": [
    { "id": "participant-id-1", "name": "Person A" },
    { "id": "participant-id-2", "name": "Person B" }
  ],
  "currencies": [
    { "code": "USD", "symbol": "$" }
  ],
  "expenses": [{
    "id": "expense-id-1",
    "date": "2026-01-15",
    "description": "Example expense",
    "currencyCode": "USD",
    "amount": 100.00,
    "paidBy": "participant-id-1",
    "splitType": "equal",
    "beneficiaries": [
      { "participantId": "participant-id-1", "customAmount": null, "customPercentage": null },
      { "participantId": "participant-id-2", "customAmount": null, "customPercentage": null }
    ]
  }],
  "exchangeRates": {},
  "settlementCurrency": ""
}`;

  async function handleTestAI() {
    aiTestLoading = true;
    try {
      const ok = await testConnection();
      if (ok) showToast($t('settings.ai.testSuccess'));
      else showToast($t('settings.ai.testFailed'), 'error');
    } catch {
      showToast($t('settings.ai.testFailed'), 'error');
    }
    aiTestLoading = false;
  }

  async function handleHardReload() {
    hardReloading = true;
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch {}
    window.location.reload();
  }
</script>

<div class="p-4 md:p-6 space-y-6">
  <!-- Theme -->
  <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
    <div class="px-4 py-3 border-b border-[var(--card-border)]">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)]">{$t('settings.appearance')}</h3>
    </div>
    <div class="p-4">
      <button
        onclick={toggleTheme}
        class="flex items-center justify-between w-full p-3 rounded-xl hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
      >
        <div class="flex items-center gap-3">
          {#if $settings.theme === 'dark'}
            <Moon size={20} class="text-primary-500" />
          {:else}
            <Sun size={20} class="text-primary-500" />
          {/if}
          <span class="text-sm font-medium text-[var(--text-primary)]">
            {$settings.theme === 'dark' ? $t('settings.darkMode') : $t('settings.lightMode')}
          </span>
        </div>
        <div class="w-12 h-7 rounded-full p-0.5 transition-colors {$settings.theme === 'dark' ? 'bg-gradient-to-r from-primary-500 to-primary-700' : 'bg-[#cbd5e1]'}">
          <div class="w-6 h-6 rounded-full bg-white shadow-sm transition-transform {$settings.theme === 'dark' ? ($isRtl ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'}"></div>
        </div>
      </button>
    </div>
  </div>

  <!-- Language -->
  <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
    <div class="px-4 py-3 border-b border-[var(--card-border)]">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)]">{$t('settings.language')}</h3>
    </div>
    <div class="p-4">
      <div class="flex rounded-xl border border-[var(--card-border)] overflow-hidden">
        <button
          onclick={() => setAppLocale('en')}
          class="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all
            {$settings.locale === 'en' ? 'bg-primary-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
        >
          English
        </button>
        <button
          onclick={() => setAppLocale('fa')}
          class="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all
            {$settings.locale === 'fa' ? 'bg-primary-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
        >
          فارسی
        </button>
      </div>
    </div>
  </div>

  <!-- Calendar -->
  <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
    <div class="px-4 py-3 border-b border-[var(--card-border)]">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)]">{$t('settings.calendar')}</h3>
    </div>
    <div class="p-4">
      <div class="flex rounded-xl border border-[var(--card-border)] overflow-hidden">
        <button
          onclick={() => setCalendar('gregorian')}
          class="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all
            {$settings.calendar === 'gregorian' ? 'bg-primary-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
        >
          <Calendar size={16} />
          {$t('settings.gregorian')}
        </button>
        <button
          onclick={() => setCalendar('jalali')}
          class="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all
            {$settings.calendar === 'jalali' ? 'bg-primary-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
        >
          <Calendar size={16} />
          {$t('settings.jalali')}
        </button>
      </div>
    </div>
  </div>

  <!-- AI Receipt Scanner Settings -->
  <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
    <div class="px-4 py-3 border-b border-[var(--card-border)]">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)] flex items-center gap-2">
        <Sparkles size={16} class="text-primary-500" />
        {$t('settings.ai.title')}
      </h3>
    </div>
    <div class="p-4 space-y-4">
      <div>
        <label class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('settings.ai.baseUrl')}</label>
        <input
          type="text"
          value={$aiSettings.baseUrl}
          oninput={(e) => updateAISettings({ baseUrl: (e.target as HTMLInputElement).value })}
          placeholder={$t('settings.ai.baseUrlPlaceholder')}
          class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all"
        />
      </div>

      <div>
        <label class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('settings.ai.apiKey')}</label>
        <div class="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={$aiSettings.apiKey}
            oninput={(e) => updateAISettings({ apiKey: (e.target as HTMLInputElement).value })}
            placeholder="sk-..."
            class="w-full px-3 py-2.5 pe-10 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all"
          />
          <button
            type="button"
            onclick={() => showApiKey = !showApiKey}
            class="absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
          >
            {#if showApiKey}
              <EyeOff size={16} class="text-[var(--text-secondary)]" />
            {:else}
              <Eye size={16} class="text-[var(--text-secondary)]" />
            {/if}
          </button>
        </div>
      </div>

      <div>
        <label class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('settings.ai.model')}</label>
        <input
          type="text"
          value={$aiSettings.model}
          oninput={(e) => updateAISettings({ model: (e.target as HTMLInputElement).value })}
          placeholder={$t('settings.ai.modelPlaceholder')}
          class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all"
        />
      </div>

      <div>
        <label class="block text-xs font-medium text-[var(--text-secondary)] mb-1">{$t('settings.ai.customPrompt')}</label>
        <textarea
          value={$aiSettings.customPrompt}
          oninput={(e) => updateAISettings({ customPrompt: (e.target as HTMLTextAreaElement).value })}
          placeholder={$t('settings.ai.customPromptPlaceholder')}
          rows="2"
          class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all resize-none"
        ></textarea>
      </div>

      <button
        onclick={handleTestAI}
        disabled={!$aiSettings.baseUrl || !$aiSettings.apiKey || !$aiSettings.model || aiTestLoading}
        class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {#if aiTestLoading}
          <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
        {/if}
        {$t('settings.ai.testConnection')}
      </button>

      <div class="flex gap-2 p-3 rounded-xl bg-surface-50 dark:bg-surface-800 border border-[var(--card-border)]">
        <Info size={14} class="text-[var(--text-secondary)] shrink-0 mt-0.5" />
        <p class="text-xs text-[var(--text-secondary)]">{$t('settings.ai.securityNotice')}</p>
      </div>
    </div>
  </div>

  <!-- Import / Export -->
  <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
    <div class="px-4 py-3 border-b border-[var(--card-border)]">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)]">{$t('settings.data')}</h3>
    </div>
    <div class="p-4 space-y-2">
      <button
        onclick={handleExport}
        class="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
      >
        <Download size={20} class="text-primary-500" />
        <span class="text-sm font-medium text-[var(--text-primary)]">{$t('settings.exportTripData')}</span>
      </button>
      <button
        onclick={() => { importOpen = true; importText = ''; importError = ''; importMode = 'replace'; loadedFileName = ''; dragOver = false; }}
        class="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
      >
        <Upload size={20} class="text-primary-500" />
        <span class="text-sm font-medium text-[var(--text-primary)]">{$t('settings.importData')}</span>
      </button>
      <button
        onclick={() => { csvImportOpen = true; }}
        class="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
      >
        <FileSpreadsheet size={20} class="text-primary-500" />
        <span class="text-sm font-medium text-[var(--text-primary)]">{$t('settings.importCsv')}</span>
      </button>
    </div>
  </div>

  <!-- Full Backup -->
  <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
    <div class="px-4 py-3 border-b border-[var(--card-border)]">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)]">{$t('settings.fullBackup')}</h3>
    </div>
    <div class="p-4 space-y-2">
      <button
        onclick={handleExportAll}
        class="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
      >
        <DatabaseBackup size={20} class="text-primary-500" />
        <div class="text-start">
          <span class="text-sm font-medium text-[var(--text-primary)] block">{$t('settings.exportAllTrips')}</span>
          <span class="text-[10px] text-[var(--text-secondary)]">{$t('settings.exportAllDesc')}</span>
        </div>
      </button>
      <button
        onclick={() => { backupImportOpen = true; backupImportText = ''; backupImportError = ''; backupLoadedFileName = ''; backupDragOver = false; }}
        class="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
      >
        <Database size={20} class="text-primary-500" />
        <div class="text-start">
          <span class="text-sm font-medium text-[var(--text-primary)] block">{$t('settings.restoreBackup')}</span>
          <span class="text-[10px] text-[var(--text-secondary)]">{$t('settings.restoreBackupDesc')}</span>
        </div>
      </button>
    </div>
  </div>

  <!-- Danger Zone -->
  <div class="bg-[var(--card-bg)] border border-danger-500/30 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
    <div class="p-4">
      <button
        onclick={() => clearConfirm = true}
        class="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-danger-500/10 transition-colors"
      >
        <Trash2 size={20} class="text-danger-500" />
        <span class="text-sm font-medium text-danger-500">{$t('settings.clearTripData')}</span>
      </button>
    </div>
  </div>

  <!-- Hard Reload -->
  <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
    <div class="p-4">
      <button
        onclick={handleHardReload}
        disabled={hardReloading}
        class="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors disabled:opacity-50"
      >
        <RefreshCw size={20} class="text-primary-500 {hardReloading ? 'animate-spin' : ''}" />
        <div class="text-start">
          <span class="text-sm font-medium text-[var(--text-primary)] block">
            {hardReloading ? $t('settings.hardReloading') : $t('settings.hardReload')}
          </span>
          <span class="text-[10px] text-[var(--text-secondary)]">{$t('settings.hardReloadDesc')}</span>
        </div>
      </button>
    </div>
  </div>

  <!-- About -->
  <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden">
    <div class="px-4 py-3 border-b border-[var(--card-border)]">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)]">{$t('settings.about')}</h3>
    </div>
    <div class="p-4 space-y-3">
      <div class="flex items-start gap-3">
        <Info size={20} class="text-primary-500 shrink-0 mt-0.5" />
        <div>
          <p class="text-sm font-medium text-[var(--text-primary)]">{$t('settings.appName')}</p>
          <p class="text-xs text-[var(--text-secondary)]">{$t('settings.version')} &middot; {$t('settings.buildLabel')} {__BUILD_NUMBER__}</p>
        </div>
      </div>
      <p class="text-xs text-[var(--text-secondary)] leading-relaxed">
        {$t('settings.aboutDesc')}
      </p>
    </div>
  </div>
</div>

<Modal open={importOpen} title={$t('settings.importTitle')} onClose={() => importOpen = false}>
  <div class="space-y-4">
    <div
      class="relative border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer
        {dragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-[var(--card-border)] hover:border-primary-400'}"
      ondragover={(e) => { e.preventDefault(); dragOver = true; }}
      ondragleave={() => { dragOver = false; }}
      ondrop={handleJsonDrop}
    >
      <FileUp size={32} class="mx-auto mb-2 text-[var(--text-secondary)]" />
      {#if loadedFileName}
        <p class="text-sm font-medium text-primary-600 mb-1">{loadedFileName}</p>
        <p class="text-xs text-[var(--text-secondary)]">{$t('common.fileLoaded')}</p>
      {:else}
        <p class="text-sm font-medium text-[var(--text-primary)] mb-1">{$t('settings.dropJsonFile')}</p>
        <p class="text-xs text-[var(--text-secondary)] mb-3">{$t('common.orClickBrowse')}</p>
      {/if}
      <input
        type="file"
        accept=".json,application/json"
        onchange={handleJsonFileInput}
        class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      {#if !loadedFileName}
        <label class="inline-block px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium cursor-pointer hover:bg-primary-500 transition-colors">
          {$t('common.chooseFile')}
          <input type="file" accept=".json,application/json" onchange={handleJsonFileInput} class="hidden" />
        </label>
      {/if}
    </div>

    <div class="relative flex items-center gap-3">
      <div class="flex-1 h-px bg-[var(--card-border)]"></div>
      <span class="text-xs text-[var(--text-secondary)] font-medium">{$t('common.orPasteJson')}</span>
      <div class="flex-1 h-px bg-[var(--card-border)]"></div>
    </div>

    <div>
      <textarea
        bind:value={importText}
        placeholder={templateJson}
        rows="8"
        class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all resize-none"
      ></textarea>
    </div>

    <div>
      <label class="block text-xs font-medium text-[var(--text-secondary)] mb-2">{$t('settings.importAs')}</label>
      <div class="flex rounded-xl border border-[var(--card-border)] overflow-hidden">
        <button
          onclick={() => importMode = 'replace'}
          class="flex-1 py-2 text-xs font-medium transition-all
            {importMode === 'replace' ? 'bg-primary-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
        >
          {$t('settings.replaceCurrentTrip')}
        </button>
        <button
          onclick={() => importMode = 'new'}
          class="flex-1 py-2 text-xs font-medium transition-all
            {importMode === 'new' ? 'bg-primary-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
        >
          {$t('settings.createNewTrip')}
        </button>
      </div>
    </div>

    {#if importError}
      <p class="text-xs text-danger-500">{importError}</p>
    {/if}
    <button
      onclick={handleImportPaste}
      class="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md"
    >
      {$t('settings.validateImport')}
    </button>

    <details class="text-xs text-[var(--text-secondary)]">
      <summary class="cursor-pointer font-medium">{$t('settings.viewTemplate')}</summary>
      <pre class="mt-2 p-3 rounded-xl bg-[#f8fafc] dark:bg-[#1e293b] border border-[var(--card-border)] overflow-x-auto text-[var(--text-secondary)]">{templateJson}</pre>
    </details>
  </div>
</Modal>

<ConfirmDialog
  open={importConfirm}
  title={importMode === 'new' ? $t('settings.importAsNewTitle') : $t('settings.replaceTitle')}
  message={importMode === 'new' ? $t('settings.importAsNewMessage') : $t('settings.replaceMessage')}
  confirmLabel={$t('common.import')}
  destructive={importMode === 'replace'}
  onConfirm={confirmImport}
  onCancel={() => importConfirm = false}
/>

<ConfirmDialog
  open={clearConfirm}
  title={$t('settings.clearTitle')}
  message={$t('settings.clearMessage')}
  confirmLabel={$t('settings.clearTripData')}
  destructive={true}
  onConfirm={handleClear}
  onCancel={() => clearConfirm = false}
/>

<CsvImportWizard
  open={csvImportOpen}
  onClose={() => { csvImportOpen = false; }}
/>

<Modal open={backupImportOpen} title={$t('settings.restoreTitle')} onClose={() => backupImportOpen = false}>
  <div class="space-y-4">
    <div
      class="relative border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer
        {backupDragOver ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-[var(--card-border)] hover:border-primary-400'}"
      ondragover={(e) => { e.preventDefault(); backupDragOver = true; }}
      ondragleave={() => { backupDragOver = false; }}
      ondrop={handleBackupDrop}
    >
      <FileUp size={32} class="mx-auto mb-2 text-[var(--text-secondary)]" />
      {#if backupLoadedFileName}
        <p class="text-sm font-medium text-primary-600 mb-1">{backupLoadedFileName}</p>
        <p class="text-xs text-[var(--text-secondary)]">{$t('common.fileLoaded')}</p>
      {:else}
        <p class="text-sm font-medium text-[var(--text-primary)] mb-1">{$t('settings.dropBackupFile')}</p>
        <p class="text-xs text-[var(--text-secondary)] mb-3">{$t('common.orClickBrowse')}</p>
      {/if}
      <input
        type="file"
        accept=".json,application/json"
        onchange={handleBackupFileInput}
        class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      {#if !backupLoadedFileName}
        <label class="inline-block px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium cursor-pointer hover:bg-primary-500 transition-colors">
          {$t('common.chooseFile')}
          <input type="file" accept=".json,application/json" onchange={handleBackupFileInput} class="hidden" />
        </label>
      {/if}
    </div>

    <div class="relative flex items-center gap-3">
      <div class="flex-1 h-px bg-[var(--card-border)]"></div>
      <span class="text-xs text-[var(--text-secondary)] font-medium">{$t('common.orPasteJson')}</span>
      <div class="flex-1 h-px bg-[var(--card-border)]"></div>
    </div>

    <div>
      <textarea
        bind:value={backupImportText}
        placeholder={'{"trips": [...], "activeTripId": null}'}
        rows="6"
        class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all resize-none"
      ></textarea>
    </div>

    {#if backupImportError}
      <p class="text-xs text-danger-500">{backupImportError}</p>
    {/if}
    <button
      onclick={handleBackupValidate}
      class="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 hover:from-primary-400 hover:to-primary-600 text-white text-sm font-semibold transition-all shadow-sm hover:shadow-md"
    >
      {$t('settings.validateRestore')}
    </button>
  </div>
</Modal>

<ConfirmDialog
  open={backupImportConfirm}
  title={$t('settings.restoreConfirmTitle')}
  message={$t('settings.restoreConfirmMessage')}
  confirmLabel={$t('settings.restore')}
  destructive={true}
  onConfirm={confirmBackupImport}
  onCancel={() => backupImportConfirm = false}
/>
