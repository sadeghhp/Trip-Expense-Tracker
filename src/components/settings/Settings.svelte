<script lang="ts">
  import { Sun, Moon, Calendar, Download, Upload, Trash2, FileSpreadsheet, FileUp, DatabaseBackup, Database } from '@lucide/svelte';
  import { settings, setCalendar, toggleTheme } from '$lib/stores/settings';
  import { replaceData, clearAllData, getSnapshot, activeTrip, importAsNewTrip, getFullSnapshot, replaceAllData } from '$lib/stores/data';
  import { getTodayForCalendar } from '$lib/engine/calendar';
  import ConfirmDialog from '../ui/ConfirmDialog.svelte';
  import Modal from '../ui/Modal.svelte';
  import CsvImportWizard from './CsvImportWizard.svelte';

  interface Props {
    showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  }

  let { showToast }: Props = $props();

  let clearConfirm = $state(false);
  let importOpen = $state(false);
  let importText = $state('');
  let importConfirm = $state(false);
  let importError = $state('');
  let importMode: 'replace' | 'new' = $state('replace');
  let csvImportOpen = $state(false);
  let dragOver = $state(false);
  let loadedFileName = $state('');
  let backupImportOpen = $state(false);
  let backupImportText = $state('');
  let backupImportError = $state('');
  let backupImportConfirm = $state(false);
  let backupDragOver = $state(false);
  let backupLoadedFileName = $state('');

  function handleJsonFile(file: File) {
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      importError = 'Please select a JSON file';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      importText = reader.result as string;
      loadedFileName = file.name;
      importError = '';
    };
    reader.onerror = () => {
      importError = 'Failed to read file';
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
      if (importMode === 'new') {
        const name = parsed.tripName || 'Imported Trip';
        const desc = parsed.tripDescription || '';
        importAsNewTrip(name, parsed, desc);
        showToast('Imported as new trip');
      } else {
        replaceData(parsed);
        showToast('Data imported into current trip');
      }
      importOpen = false;
      importText = '';
      importConfirm = false;
      loadedFileName = '';
    } catch (e: any) {
      showToast('Import failed: ' + e.message, 'error');
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
    showToast('Full backup exported');
  }

  function handleBackupFile(file: File) {
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      backupImportError = 'Please select a JSON file';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      backupImportText = reader.result as string;
      backupLoadedFileName = file.name;
      backupImportError = '';
    };
    reader.onerror = () => {
      backupImportError = 'Failed to read file';
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
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON object');
      if (!Array.isArray(parsed.trips)) throw new Error('Missing trips array — this does not look like a full backup');
      backupImportConfirm = true;
    } catch (e: any) {
      backupImportError = e.message || 'Invalid JSON';
    }
  }

  function confirmBackupImport() {
    try {
      const parsed = JSON.parse(backupImportText);
      replaceAllData(parsed);
      showToast('Backup restored — all trips replaced');
      backupImportOpen = false;
      backupImportText = '';
      backupImportConfirm = false;
      backupLoadedFileName = '';
    } catch (e: any) {
      showToast('Restore failed: ' + e.message, 'error');
    }
  }

  function handleClear() {
    clearAllData();
    showToast('Trip data cleared');
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
  <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
    <div class="px-4 py-3 border-b border-[var(--card-border)]">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)]">Appearance</h3>
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
            {$settings.theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
          </span>
        </div>
        <div class="w-12 h-7 rounded-full p-0.5 transition-colors {$settings.theme === 'dark' ? 'bg-gradient-to-r from-primary-500 to-primary-700' : 'bg-[#cbd5e1]'}">
          <div class="w-6 h-6 rounded-full bg-white shadow-sm transition-transform {$settings.theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}"></div>
        </div>
      </button>
    </div>
  </div>

  <!-- Calendar -->
  <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
    <div class="px-4 py-3 border-b border-[var(--card-border)]">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)]">Calendar</h3>
    </div>
    <div class="p-4">
      <div class="flex rounded-xl border border-[var(--card-border)] overflow-hidden">
        <button
          onclick={() => setCalendar('gregorian')}
          class="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all
            {$settings.calendar === 'gregorian' ? 'bg-primary-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
        >
          <Calendar size={16} />
          Gregorian
        </button>
        <button
          onclick={() => setCalendar('jalali')}
          class="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all
            {$settings.calendar === 'jalali' ? 'bg-primary-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
        >
          <Calendar size={16} />
          Jalali
        </button>
      </div>
    </div>
  </div>

  <!-- Import / Export -->
  <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
    <div class="px-4 py-3 border-b border-[var(--card-border)]">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)]">Data</h3>
    </div>
    <div class="p-4 space-y-2">
      <button
        onclick={handleExport}
        class="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
      >
        <Download size={20} class="text-primary-500" />
        <span class="text-sm font-medium text-[var(--text-primary)]">Export Trip Data (JSON)</span>
      </button>
      <button
        onclick={() => { importOpen = true; importText = ''; importError = ''; importMode = 'replace'; loadedFileName = ''; dragOver = false; }}
        class="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
      >
        <Upload size={20} class="text-primary-500" />
        <span class="text-sm font-medium text-[var(--text-primary)]">Import Data (JSON)</span>
      </button>
      <button
        onclick={() => { csvImportOpen = true; }}
        class="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
      >
        <FileSpreadsheet size={20} class="text-primary-500" />
        <span class="text-sm font-medium text-[var(--text-primary)]">Import CSV</span>
      </button>
    </div>
  </div>

  <!-- Full Backup -->
  <div class="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
    <div class="px-4 py-3 border-b border-[var(--card-border)]">
      <h3 class="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)]">Full Backup</h3>
    </div>
    <div class="p-4 space-y-2">
      <button
        onclick={handleExportAll}
        class="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
      >
        <DatabaseBackup size={20} class="text-primary-500" />
        <div class="text-left">
          <span class="text-sm font-medium text-[var(--text-primary)] block">Export All Trips</span>
          <span class="text-[10px] text-[var(--text-secondary)]">Download a full backup of every trip</span>
        </div>
      </button>
      <button
        onclick={() => { backupImportOpen = true; backupImportText = ''; backupImportError = ''; backupLoadedFileName = ''; backupDragOver = false; }}
        class="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b] transition-colors"
      >
        <Database size={20} class="text-primary-500" />
        <div class="text-left">
          <span class="text-sm font-medium text-[var(--text-primary)] block">Restore Backup</span>
          <span class="text-[10px] text-[var(--text-secondary)]">Replace all trips from a backup file</span>
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
        <span class="text-sm font-medium text-danger-500">Clear Trip Data</span>
      </button>
    </div>
  </div>
</div>

<Modal open={importOpen} title="Import Data" onClose={() => importOpen = false}>
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
        <p class="text-xs text-[var(--text-secondary)]">File loaded — drop another to replace</p>
      {:else}
        <p class="text-sm font-medium text-[var(--text-primary)] mb-1">Drop JSON file here</p>
        <p class="text-xs text-[var(--text-secondary)] mb-3">or click to browse</p>
      {/if}
      <input
        type="file"
        accept=".json,application/json"
        onchange={handleJsonFileInput}
        class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      {#if !loadedFileName}
        <label class="inline-block px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium cursor-pointer hover:bg-primary-500 transition-colors">
          Choose File
          <input type="file" accept=".json,application/json" onchange={handleJsonFileInput} class="hidden" />
        </label>
      {/if}
    </div>

    <div class="relative flex items-center gap-3">
      <div class="flex-1 h-px bg-[var(--card-border)]"></div>
      <span class="text-xs text-[var(--text-secondary)] font-medium">or paste JSON</span>
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
      <label class="block text-xs font-medium text-[var(--text-secondary)] mb-2">Import as</label>
      <div class="flex rounded-xl border border-[var(--card-border)] overflow-hidden">
        <button
          onclick={() => importMode = 'replace'}
          class="flex-1 py-2 text-xs font-medium transition-all
            {importMode === 'replace' ? 'bg-primary-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
        >
          Replace Current Trip
        </button>
        <button
          onclick={() => importMode = 'new'}
          class="flex-1 py-2 text-xs font-medium transition-all
            {importMode === 'new' ? 'bg-primary-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[#f1f5f9] dark:hover:bg-[#1e293b]'}"
        >
          Create New Trip
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
      Validate & Import
    </button>

    <details class="text-xs text-[var(--text-secondary)]">
      <summary class="cursor-pointer font-medium">View Template</summary>
      <pre class="mt-2 p-3 rounded-xl bg-[#f8fafc] dark:bg-[#1e293b] border border-[var(--card-border)] overflow-x-auto text-[var(--text-secondary)]">{templateJson}</pre>
    </details>
  </div>
</Modal>

<ConfirmDialog
  open={importConfirm}
  title={importMode === 'new' ? 'Import as New Trip?' : 'Replace Current Trip Data?'}
  message={importMode === 'new' ? 'This will create a new trip with the imported data.' : 'Importing will replace ALL data in the current trip. This cannot be undone.'}
  confirmLabel="Import"
  destructive={importMode === 'replace'}
  onConfirm={confirmImport}
  onCancel={() => importConfirm = false}
/>

<ConfirmDialog
  open={clearConfirm}
  title="Clear Trip Data"
  message="Are you sure you want to clear all data in this trip? Participants, currencies, and expenses will be deleted. This cannot be undone."
  confirmLabel="Clear Trip Data"
  destructive={true}
  onConfirm={handleClear}
  onCancel={() => clearConfirm = false}
/>

<CsvImportWizard
  open={csvImportOpen}
  onClose={() => { csvImportOpen = false; }}
  showToast={showToast}
/>

<Modal open={backupImportOpen} title="Restore Full Backup" onClose={() => backupImportOpen = false}>
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
        <p class="text-xs text-[var(--text-secondary)]">File loaded — drop another to replace</p>
      {:else}
        <p class="text-sm font-medium text-[var(--text-primary)] mb-1">Drop backup file here</p>
        <p class="text-xs text-[var(--text-secondary)] mb-3">or click to browse</p>
      {/if}
      <input
        type="file"
        accept=".json,application/json"
        onchange={handleBackupFileInput}
        class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      {#if !backupLoadedFileName}
        <label class="inline-block px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium cursor-pointer hover:bg-primary-500 transition-colors">
          Choose File
          <input type="file" accept=".json,application/json" onchange={handleBackupFileInput} class="hidden" />
        </label>
      {/if}
    </div>

    <div class="relative flex items-center gap-3">
      <div class="flex-1 h-px bg-[var(--card-border)]"></div>
      <span class="text-xs text-[var(--text-secondary)] font-medium">or paste JSON</span>
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
      Validate & Restore
    </button>
  </div>
</Modal>

<ConfirmDialog
  open={backupImportConfirm}
  title="Restore Full Backup?"
  message="This will replace ALL your trips with the data from the backup file. All current trips will be lost. This cannot be undone."
  confirmLabel="Restore"
  destructive={true}
  onConfirm={confirmBackupImport}
  onCancel={() => backupImportConfirm = false}
/>
