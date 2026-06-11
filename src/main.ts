import JSZip from 'jszip';
import './style.css';
import { TranslationItem, TranslationUpdate, TranslationCategory, LanguageOption, CATEGORY_TABS } from './types';
import { exportTranslations, ExportResult, LanguageNotAvailableError, reparseExport } from './services/translation-export';
import { importTranslations } from './services/translation-import';
import { resolveObjectTypes } from './services/metadata-resolver';
import { getSavedLanguage, saveLanguage, AVAILABLE_LANGUAGES, getLanguageByLcid, fetchProvisionedLanguages } from './services/language-service';
import { categorizeItems, getCategoryCounts } from './utils/categorizer';
import { renderSidebar } from './components/sidebar';
import { renderTable } from './components/table';
import { renderToolbar } from './components/toolbar';
import { renderTabBar } from './components/tab-bar';

import { showLoadingOverlay, updateLoadingMessage, hideLoadingOverlay } from './components/loading-overlay';
import { initDebugLog, log } from './components/debug-log';

/** Show a PPTB notification. Wraps the official API shape (title + body). */
function notify(body: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  try {
    window.toolboxAPI?.utils?.showNotification({ title: 'Translation Tool', body, type });
  } catch { /* ignore */ }
}

/** Extract the best URL from a connection (field name varies across PPTB versions). */
function pickConnectionUrl(c: Record<string, unknown>): string {
  const candidates = [c.url, c.environmentUrl, c.instanceUrl, c.apiUrl, c.resourceUrl];
  for (const v of candidates) {
    if (typeof v === 'string' && v.startsWith('https://')) return v.replace(/\/+$/, '');
  }
  return '';
}

/** Extract a display name from a connection object. */
function pickConnectionName(c: Record<string, unknown>): string {
  const candidates = [c.name, c.environmentName, c.friendlyName, c.environment, c.url];
  for (const v of candidates) {
    if (typeof v === 'string' && v) return v.replace(/^https:\/\//, '');
  }
  return 'unknown';
}

// App state
let items: TranslationItem[] = [];
let currentEntity: string | null = null;
let currentTab: TranslationCategory | 'all' = 'all';
let missingOnly = true;
let searchQuery = '';
let targetLanguage: LanguageOption = AVAILABLE_LANGUAGES[0];
let availableLanguages: number[] = []; // LCIDs detected from export
let exportedXml = '';
let exportedZip: JSZip | null = null;
const drafts: Map<string, string> = new Map();

// DOM elements
const solutionSelect = document.getElementById('solutionName') as HTMLSelectElement;
const btnLoadSolutions = document.getElementById('btnLoadSolutions') as HTMLButtonElement;
const btnLoad = document.getElementById('btnLoad') as HTMLButtonElement;
const btnImport = document.getElementById('btnImport') as HTMLButtonElement;
const sidebarContainer = document.getElementById('entityList') as HTMLElement;
const tabBarContainer = document.getElementById('tabBar') as HTMLElement;
const toolbarContainer = document.getElementById('toolbar') as HTMLElement;
const tableContainer = document.getElementById('tableContainer') as HTMLElement;
const importStatus = document.getElementById('importStatus') as HTMLElement;

// Initialize
async function init(): Promise<void> {
  initDebugLog();
  log('info', 'Initializing Translation Tool...');

  btnLoad.addEventListener('click', handleExport);
  btnImport.addEventListener('click', handleImport);
  btnLoadSolutions.addEventListener('click', () => loadSolutionList());
  log('debug', 'Event listeners attached');

  renderToolbarComponent();
  log('debug', 'Initial UI rendered');

  // Wait for toolboxAPI to be available
  await waitForToolboxAPI();
  log('success', 'toolboxAPI available');

  await applyTheme();
  log('debug', 'Theme applied');

  try {
    const handlePptbEvent = (_event: unknown, payload: ToolBoxAPI.ToolBoxEventPayload) => {
      log('debug', `PPTB event: ${payload.event}`);
      switch (payload.event) {
        case 'settings:updated':
          applyTheme();
          break;
        case 'connection:updated':
        case 'connection:created':
          log('info', 'Connection changed, refreshing...');
          break;
        case 'connection:deleted':
          log('warn', 'Connection deleted');
          break;
      }
    };
    window.toolboxAPI.events.on(handlePptbEvent);
  } catch { /* ignore */ }

  try {
    targetLanguage = await getSavedLanguage();
    log('info', `Language: ${targetLanguage.name} (LCID: ${targetLanguage.lcid})`);
    renderToolbarComponent();
  } catch {
    targetLanguage = AVAILABLE_LANGUAGES[0];
    log('warn', 'Failed to load saved language, using default');
  }

  // Fetch provisioned languages from Dataverse
  try {
    const provisioned = await fetchProvisionedLanguages();
    if (provisioned.length > 0) {
      availableLanguages = provisioned;
      log('info', `Provisioned languages: ${provisioned.map(l => getLanguageByLcid(l)?.name || l).join(', ')}`);
      renderToolbarComponent();
    }
  } catch {
    log('debug', 'Could not fetch provisioned languages');
  }

  try {
    const lastSolution = await window.toolboxAPI.settings.get('translation-tool:lastSolution') as string;
    if (lastSolution) {
      solutionSelect.value = lastSolution;
      log('info', `Last solution: ${lastSolution}`);
    }
  } catch {
    log('warn', 'Failed to load last solution');
  }

  // Load available solutions for picker dropdown
  loadSolutionList();

  log('success', 'Initialization complete');
}

/**
 * Load unmanaged solutions into the select dropdown.
 */
async function loadSolutionList(): Promise<void> {
  try {
    const resp = await window.dataverseAPI.queryData(
      'solutions?$select=uniquename,friendlyname&$filter=ismanaged eq false and isvisible eq true&$orderby=friendlyname asc'
    ) as { value?: Array<{ uniquename: string; friendlyname: string }> };

    if (!resp.value) return;

    const currentValue = solutionSelect.value;
    solutionSelect.innerHTML = '';

    for (const sol of resp.value) {
      const option = document.createElement('option');
      option.value = sol.uniquename;
      option.textContent = `${sol.friendlyname} (${sol.uniquename})`;
      solutionSelect.appendChild(option);
    }

    log('debug', `Loaded ${resp.value.length} solution(s) into picker`);

    // Restore previous selection or auto-select first
    if (currentValue && resp.value.some(s => s.uniquename === currentValue)) {
      solutionSelect.value = currentValue;
    } else if (resp.value.length > 0) {
      solutionSelect.value = resp.value[0].uniquename;
      log('info', `Auto-selected solution: ${resp.value[0].uniquename}`);
    }
  } catch (e) {
    log('warn', 'Failed to load solutions for picker', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Apply PPTB theme (light/dark) to document root.
 */
async function applyTheme(): Promise<void> {
  try {
    const theme = await window.toolboxAPI.utils.getCurrentTheme();
    document.documentElement.setAttribute('data-theme', theme);
  } catch {
    // Fallback: no attribute set, CSS media query handles it
  }
}

/**
 * Wait until window.toolboxAPI is available (PPTB injects it asynchronously).
 */
function waitForToolboxAPI(): Promise<void> {
  return new Promise((resolve) => {
    if (window.toolboxAPI) {
      resolve();
      return;
    }
    console.log('[TranslationTool] Waiting for toolboxAPI...');
    const interval = setInterval(() => {
      if (window.toolboxAPI) {
        clearInterval(interval);
        console.log('[TranslationTool] toolboxAPI available');
        resolve();
      }
    }, 100);
    // Timeout after 5 seconds
    setTimeout(() => {
      clearInterval(interval);
      console.warn('[TranslationTool] toolboxAPI not available after 5s, continuing anyway');
      resolve();
    }, 5000);
  });
}

async function handleExport(): Promise<void> {
  try {
    const solutionName = solutionSelect.value.trim();

    if (!solutionName) {
      log('warn', 'No solution name entered');
      importStatus.textContent = '⚠️ Please enter a solution name.';
      importStatus.style.color = 'orange';
      notify('Please enter a solution name.', 'warning');
      return;
    }

    if (!window.toolboxAPI || !window.dataverseAPI) {
      log('error', 'ToolBox API not available');
      importStatus.textContent = '❌ ToolBox API not available!';
      importStatus.style.color = 'red';
      return;
    }

    showLoadingOverlay('Checking connection...');
    log('info', 'Checking Dataverse connection...');

    const connection = await window.toolboxAPI.connections.getActiveConnection();
    if (!connection) {
      hideLoadingOverlay();
      log('error', 'No active connection');
      importStatus.textContent = '❌ No active connection!';
      importStatus.style.color = 'red';
      notify('No active connection.', 'error');
      return;
    }
    log('success', `Connected to: ${pickConnectionName(connection as unknown as Record<string, unknown>)}`);

    updateLoadingMessage(`Exporting translations for "${solutionName}"...`);
    log('info', `Calling ExportTranslation for "${solutionName}"...`);
    await window.toolboxAPI.settings.set('translation-tool:lastSolution', solutionName);

    const result: ExportResult = await exportTranslations(solutionName, targetLanguage.lcid);
    log('success', `Export returned ${result.items.length} items`);
    items = result.items;
    exportedXml = result.xml;
    exportedZip = result.zip;
    availableLanguages = result.availableLanguages;
    currentEntity = null;
    drafts.clear();

    // Update toolbar to show only available languages
    renderToolbarComponent();

    updateLoadingMessage('Loading saved drafts...');
    log('debug', 'Loading saved drafts...');
    await loadDrafts();
    log('debug', `Loaded ${drafts.size} draft(s)`);

    const entityCount = new Set(items.map(i => i.entity).filter(Boolean)).size;
    updateLoadingMessage(`Resolving metadata for ${entityCount} entities...`);
    log('info', `Resolving metadata for ${entityCount} entities...`);
    await resolveObjectTypes(items);
    log('success', 'Metadata resolved');

    categorizeItems(items);
    log('debug', 'Items categorized');

    hideLoadingOverlay();
    renderAll();
    btnImport.disabled = false;

    const missingCount = items.filter(i => i.isMissing).length;
    importStatus.textContent = `✓ Loaded ${items.length} items (${missingCount} missing).`;
    importStatus.style.color = 'var(--colorStatusSuccessForeground)';
    log('success', `Done! ${items.length} items loaded, ${missingCount} missing translations`);

    notify(`Loaded ${items.length} translation items.`, 'success');
  } catch (err) {
    hideLoadingOverlay();

    // Handle language mismatch — re-parse cached ZIP (no second Dataverse call)
    if (err instanceof LanguageNotAvailableError) {
      const { availableLcids, cachedXml, cachedZip } = err;
      log('warn', `Language mismatch! Switching from LCID:${err.targetLcid} to available language...`);

      // Pick the best available language
      let newLang: LanguageOption | undefined;
      if (availableLcids.length === 1) {
        newLang = getLanguageByLcid(availableLcids[0]);
      } else if (availableLcids.length > 1) {
        const firstKnown = availableLcids.find(l => getLanguageByLcid(l));
        if (firstKnown) newLang = getLanguageByLcid(firstKnown);
      }

      if (newLang) {
        targetLanguage = newLang;
        await saveLanguage(newLang);
        availableLanguages = availableLcids;

        const langNames = availableLcids
          .map(l => getLanguageByLcid(l)?.name || `LCID:${l}`)
          .join(', ');
        log('success', `Auto-switched to ${newLang.name}. Available: ${langNames}`);
        notify(`Switched to ${newLang.name}`, 'info');

        // Re-parse cached data instead of re-fetching from Dataverse
        showLoadingOverlay(`Re-parsing for ${newLang.name}...`);
        const result = reparseExport(cachedXml, cachedZip, newLang.lcid);
        items = result.items;
        exportedXml = result.xml;
        exportedZip = result.zip;
        drafts.clear();

        const entityCount = new Set(items.map(i => i.entity).filter(Boolean)).size;
        updateLoadingMessage(`Resolving metadata for ${entityCount} entities...`);
        await resolveObjectTypes(items);
        categorizeItems(items);

        hideLoadingOverlay();
        renderToolbarComponent();
        renderAll();
        btnImport.disabled = false;

        const missingCount = items.filter(i => i.isMissing).length;
        importStatus.textContent = `✓ Loaded ${items.length} items (${missingCount} missing).`;
        importStatus.style.color = 'var(--colorStatusSuccessForeground)';
        log('success', `Done! ${items.length} items loaded, ${missingCount} missing translations`);
        notify(`Loaded ${items.length} translation items.`, 'success');
        return;
      }

      // Fallback: no known language found
      importStatus.textContent = `❌ ${err.message}`;
      importStatus.style.color = 'red';
      notify(err.message, 'error');
      return;
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    log('error', 'Export failed', errorMsg);
    importStatus.textContent = `❌ Error: ${errorMsg}`;
    importStatus.style.color = 'red';
    if (window.toolboxAPI) {
      notify(`Export failed: ${errorMsg}`, 'error');
    }
  }
}

async function handleImport(): Promise<void> {
  if (!exportedZip) return;

  const updates: TranslationUpdate[] = [];
  for (const item of items) {
    const draft = drafts.get(item.id);
    if (draft && draft !== item.target) {
      updates.push({ id: item.id, target: draft });
    }
  }

  if (updates.length === 0) {
    notify('No changes to import.', 'info');
    return;
  }

  showLoadingOverlay(`Preparing ${updates.length} translation(s)...`);

  try {
    updateLoadingMessage(`Importing ${updates.length} translation(s) to Dataverse...`);
    const result = await importTranslations(exportedXml, exportedZip, updates, targetLanguage.lcid);

    hideLoadingOverlay();
    importStatus.textContent = '✓ ' + result.message;
    importStatus.style.color = 'var(--colorStatusSuccessForeground)';

    for (const u of updates) {
      drafts.delete(u.id);
      const item = items.find(i => i.id === u.id);
      if (item) {
        item.target = u.target;
        item.isMissing = false;
      }
    }

    await saveDrafts();
    renderAll();

    notify(result.message, 'success');
  } catch (err) {
    hideLoadingOverlay();
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[TranslationTool] Import failed:', err);
    importStatus.textContent = '✗ ' + errorMsg;
    importStatus.style.color = 'var(--colorStatusDangerForeground)';

    notify(`Import failed: ${errorMsg}`, 'error');
  }
}

function getDraftValue(id: string): string {
  return drafts.get(id) || '';
}

function handleInputChange(id: string, value: string): void {
  if (value) {
    drafts.set(id, value);
  } else {
    drafts.delete(id);
  }
  // Debounced save
  clearTimeout(saveTimeout);
  saveTimeout = window.setTimeout(() => saveDrafts(), 1000);

  // Update sidebar counts
  clearTimeout(sidebarTimeout);
  sidebarTimeout = window.setTimeout(() => renderSidebarComponent(), 300);
}

let saveTimeout = 0;
let sidebarTimeout = 0;

function handleCopyEnglish(id: string): void {
  const item = items.find(i => i.id === id);
  if (!item) return;

  drafts.set(id, item.english);
  saveDrafts();
  renderTableComponent();
  renderSidebarComponent();
}

function handleCopyAllEnglish(): void {
  const filtered = getFilteredItems();
  for (const item of filtered) {
    if (!getDraftValue(item.id) && !item.target) {
      drafts.set(item.id, item.english);
    }
  }
  saveDrafts();
  renderTableComponent();
  renderSidebarComponent();
}

function handleSelectEntity(entity: string | null): void {
  currentEntity = entity;
  renderSidebarComponent();
  renderTabBarComponent();
  renderTableComponent();
}

function handleTabChange(tab: TranslationCategory | 'all'): void {
  currentTab = tab;
  renderTabBarComponent();
  renderTableComponent();
}

function handleSearchChange(query: string): void {
  searchQuery = query;
  renderTableComponent();
}

function handleMissingOnlyChange(checked: boolean): void {
  missingOnly = checked;
  renderTableComponent();
}

async function handleLanguageChange(language: LanguageOption): Promise<void> {
  targetLanguage = language;
  await saveLanguage(language);

  // Need to re-export with new language
  notify(`Language changed to ${language.name}. Click "Export & Load" to reload translations.`, 'info');
}

function getFilteredItems(): TranslationItem[] {
  let filtered = items;
  if (currentEntity) {
    if (currentEntity === '__GLOBAL__') {
      filtered = filtered.filter(i => !i.entity || i.entity === 'Solution' || i.entity === 'Publisher' || i.entity === 'SiteMap' || i.entity === 'AppModule');
    } else {
      filtered = filtered.filter(i => i.entity === currentEntity);
    }
  }
  if (currentTab !== 'all') {
    filtered = filtered.filter(i => i.category === currentTab);
  }
  if (missingOnly) {
    filtered = filtered.filter(i => i.isMissing && !getDraftValue(i.id));
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(i =>
      i.english.toLowerCase().includes(q) ||
      i.target.toLowerCase().includes(q) ||
      i.objectType.toLowerCase().includes(q) ||
      i.objectParent.toLowerCase().includes(q) ||
      (getDraftValue(i.id) || '').toLowerCase().includes(q)
    );
  }
  return filtered;
}

// Render functions
function renderAll(): void {
  renderToolbarComponent();
  renderSidebarComponent();
  renderTabBarComponent();
  renderTableComponent();
}

function renderToolbarComponent(): void {
  const totalMissing = items.filter(i => i.isMissing && !getDraftValue(i.id)).length;
  renderToolbar(toolbarContainer, {
    missingOnly,
    searchQuery,
    selectedLanguage: targetLanguage,
    totalMissing,
    availableLanguages,
    onMissingOnlyChange: handleMissingOnlyChange,
    onLanguageChange: handleLanguageChange,
    onCopyAllEnglish: handleCopyAllEnglish,
    onSearchChange: handleSearchChange,
  });
}

function renderTabBarComponent(): void {
  // Get items filtered by current entity only (not tab)
  let entityItems = items;
  if (currentEntity) {
    if (currentEntity === '__GLOBAL__') {
      entityItems = items.filter(i => !i.entity || i.entity === 'Solution' || i.entity === 'Publisher' || i.entity === 'SiteMap' || i.entity === 'AppModule');
    } else {
      entityItems = items.filter(i => i.entity === currentEntity);
    }
  }
  const counts = getCategoryCounts(entityItems);
  renderTabBar(tabBarContainer, {
    currentTab,
    counts,
    onTabChange: handleTabChange,
  });
}

function renderSidebarComponent(): void {
  renderSidebar(sidebarContainer, {
    items,
    currentEntity,
    getDraftValue,
    onSelectEntity: handleSelectEntity,
  });
}

function renderTableComponent(): void {
  const filtered = getFilteredItems();
  renderTable(tableContainer, {
    items: filtered,
    getDraftValue,
    onInputChange: handleInputChange,
    onCopyEnglish: handleCopyEnglish,
  });
}

// Draft persistence via PPTB settings
async function loadDrafts(): Promise<void> {
  try {
    const saved = await window.toolboxAPI.settings.get('drafts') as Record<string, string> | null;
    if (saved) {
      for (const [key, value] of Object.entries(saved)) {
        if (value) drafts.set(key, value);
      }
    }
  } catch { /* ignore */ }
}

async function saveDrafts(): Promise<void> {
  try {
    const obj: Record<string, string> = {};
    drafts.forEach((value, key) => { obj[key] = value; });
    await window.toolboxAPI.settings.set('drafts', obj);
  } catch { /* ignore */ }
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => init());
} else {
  init();
}
