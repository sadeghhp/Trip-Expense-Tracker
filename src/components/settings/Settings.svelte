<script lang="ts">
  import { Sun, Moon, Calendar, Download, Upload, Trash2 } from '@lucide/svelte';
  import { settings, setCalendar, toggleTheme } from '$lib/stores/settings';
  import { appData, replaceData, clearAllData, getSnapshot } from '$lib/stores/data';
  import { getTodayForCalendar } from '$lib/engine/calendar';
  import type { CalendarType } from '$lib/types';
  import ConfirmDialog from '../ui/ConfirmDialog.svelte';
  import Modal from '../ui/Modal.svelte';

  interface Props {
    showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  }

  let { showToast }: Props = $props();

  let clearConfirm = $state(false);
  let importOpen = $state(false);
  let importText = $state('');
  let importConfirm = $state(false);
  let importError = $state('');

  function handleExport() {
    const data = getSnapshot();
    const json = JSON.stringify(data, null, 2);
    const dateStr = getTodayForCalendar($settings.calendar);
    const filename = `trip-expenses-${dateStr}.json`;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported successfully');
  }

  function handleImportPaste() {
    importError = '';
    try {
      const parsed = JSON.parse(importText);
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON object');
      if (!Array.isArray(parsed.participants)) throw new Error('Missing participants array');
      if (!Array.isArray(parsed.currencies)) throw new Error('Missing currencies array');
      if (!Array.isArray(parsed.expenses)) throw new Error('Missing expenses array');
      importConfirm = true;
    } catch (e: any) {
      importError = e.message || 'Invalid JSON';
    }
  }

  function confirmImport() {
    try {
      const parsed = JSON.parse(importText);
      replaceData(parsed);
      showToast('Data imported successfully');
      importOpen = false;
      importText = '';
      importConfirm = false;
    } catch (e: any) {
      showToast('Import failed: ' + e.message, 'error');
    }
  }

  function handleClear() {
    clearAllData();
    showToast('All data cleared');
    clearConfirm = false;
  }

  const templateJson = `{
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
      { "participantId": "participant-id-1", "customAmount": null },
      { "participantId": "participant-id-2", "customAmount": null }
    ]
  }],
  "exchangeRates": {},
  "settlementCurrency": ""
}`;
</script>

<div class="p-4 md:p-6 space-y-6">
  <!-- Theme -->
  <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden">
    <div class="px-4 py-3 border-b border-[var(--card-border)]">
      <h3 class="text-sm font-semibold text-[var(--text-primary)]">Appearance</h3>
    </div>
    <div class="p-4">
      <button
        onclick={toggleTheme}
        class="flex items-center justify-between w-full p-3 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
      >
        <div class="flex items-center gap-3">
          {#if $settings.theme === 'dark'}
            <Moon size={20} class="text-primary-500" />
          {:else}
            <Sun size={20} class="text-primary-500" />
          {/if}
          <span class="text-sm font-medium text-[var(--text-primary)]">
            {$settings.theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
          </span>
        </div>
        <div class="w-12 h-7 rounded-full p-0.5 transition-colors {$settings.theme === 'dark' ? 'bg-primary-600' : 'bg-surface-200 dark:bg-surface-700'}">
          <div class="w-6 h-6 rounded-full bg-white shadow transition-transform {$settings.theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}"></div>
        </div>
      </button>
    </div>
  </div>

  <!-- Calendar -->
  <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden">
    <div class="px-4 py-3 border-b border-[var(--card-border)]">
      <h3 class="text-sm font-semibold text-[var(--text-primary)]">Calendar</h3>
    </div>
    <div class="p-4">
      <div class="flex rounded-xl border border-[var(--card-border)] overflow-hidden">
        <button
          onclick={() => setCalendar('gregorian')}
          class="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all
            {$settings.calendar === 'gregorian' ? 'bg-primary-600 text-white' : 'text-[var(--text-secondary)] hover:bg-surface-100 dark:hover:bg-surface-800'}"
        >
          <Calendar size={16} />
          Gregorian
        </button>
        <button
          onclick={() => setCalendar('jalali')}
          class="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all
            {$settings.calendar === 'jalali' ? 'bg-primary-600 text-white' : 'text-[var(--text-secondary)] hover:bg-surface-100 dark:hover:bg-surface-800'}"
        >
          <Calendar size={16} />
          Jalali
        </button>
      </div>
    </div>
  </div>

  <!-- Import / Export -->
  <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden">
    <div class="px-4 py-3 border-b border-[var(--card-border)]">
      <h3 class="text-sm font-semibold text-[var(--text-primary)]">Data</h3>
    </div>
    <div class="p-4 space-y-2">
      <button
        onclick={handleExport}
        class="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
      >
        <Download size={20} class="text-primary-500" />
        <span class="text-sm font-medium text-[var(--text-primary)]">Export Data (JSON)</span>
      </button>
      <button
        onclick={() => { importOpen = true; importText = ''; importError = ''; }}
        class="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
      >
        <Upload size={20} class="text-primary-500" />
        <span class="text-sm font-medium text-[var(--text-primary)]">Import Data</span>
      </button>
    </div>
  </div>

  <!-- Danger Zone -->
  <div class="bg-[var(--card-bg)] border border-danger-500/30 rounded-2xl shadow-sm overflow-hidden">
    <div class="p-4">
      <button
        onclick={() => clearConfirm = true}
        class="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-danger-500/10 transition-colors"
      >
        <Trash2 size={20} class="text-danger-500" />
        <span class="text-sm font-medium text-danger-500">Clear All Data</span>
      </button>
    </div>
  </div>
</div>

<Modal open={importOpen} title="Import Data" onClose={() => importOpen = false}>
  <div class="space-y-4">
    <div>
      <label class="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Paste JSON data</label>
      <textarea
        bind:value={importText}
        placeholder={templateJson}
        rows="10"
        class="w-full px-3 py-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--app-bg)] text-[var(--text-primary)] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all resize-none"
      ></textarea>
    </div>
    {#if importError}
      <p class="text-xs text-danger-500">{importError}</p>
    {/if}
    <button
      onclick={handleImportPaste}
      class="w-full py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold transition-colors"
    >
      Validate & Import
    </button>

    <details class="text-xs text-[var(--text-secondary)]">
      <summary class="cursor-pointer font-medium">View Template</summary>
      <pre class="mt-2 p-3 rounded-xl bg-surface-100 dark:bg-surface-800 overflow-x-auto">{templateJson}</pre>
    </details>
  </div>
</Modal>

<ConfirmDialog
  open={importConfirm}
  title="Replace All Data?"
  message="Importing will replace ALL current data. This cannot be undone."
  confirmLabel="Import"
  destructive={true}
  onConfirm={confirmImport}
  onCancel={() => importConfirm = false}
/>

<ConfirmDialog
  open={clearConfirm}
  title="Clear All Data"
  message="Are you sure you want to delete ALL data? This action cannot be undone."
  confirmLabel="Clear Everything"
  destructive={true}
  onConfirm={handleClear}
  onCancel={() => clearConfirm = false}
/>
