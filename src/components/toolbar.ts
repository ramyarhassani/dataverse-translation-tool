import { LanguageOption } from '../types';
import { AVAILABLE_LANGUAGES } from '../services/language-service';

export interface ToolbarProps {
  missingOnly: boolean;
  searchQuery: string;
  selectedLanguage: LanguageOption;
  totalMissing: number;
  /** LCIDs available in the current export. Empty = show all languages. */
  availableLanguages: number[];
  onMissingOnlyChange: (checked: boolean) => void;
  onLanguageChange: (language: LanguageOption) => void;
  onCopyAllEnglish: () => void;
  onSearchChange: (query: string) => void;
}

export function renderToolbar(container: HTMLElement, props: ToolbarProps): void {
  const { missingOnly, searchQuery, selectedLanguage, totalMissing, availableLanguages, onMissingOnlyChange, onLanguageChange, onCopyAllEnglish, onSearchChange } = props;

  // Filter to only available languages if we have export data
  const languages = availableLanguages.length > 0
    ? AVAILABLE_LANGUAGES.filter(l => availableLanguages.includes(l.lcid))
    : AVAILABLE_LANGUAGES;

  let languageOptions = '';
  for (const lang of languages) {
    const selected = lang.lcid === selectedLanguage.lcid ? 'selected' : '';
    languageOptions += `<option value="${lang.lcid}" ${selected}>${lang.name}</option>`;
  }

  container.innerHTML = `
    <div class="toolbar-left">
      <div class="search-box">
        <input type="text" id="txtSearch" placeholder="🔍 Search..." value="${escapeAttr(searchQuery)}">
      </div>
      <label class="checkbox-label"><input type="checkbox" id="chkMissingOnly" ${missingOnly ? 'checked' : ''}> Missing only</label>
      <button id="btnCopyAll" class="btn-sm" title="Copy English to all empty target fields">📋 Copy All</button>
    </div>
    <div class="toolbar-right">
      <select id="selLanguage" title="Target language">${languageOptions}</select>
      <span class="status-count">${totalMissing} missing</span>
    </div>
  `;

  container.querySelector('#chkMissingOnly')?.addEventListener('change', (e) => {
    onMissingOnlyChange((e.target as HTMLInputElement).checked);
  });

  container.querySelector('#selLanguage')?.addEventListener('change', (e) => {
    const lcid = parseInt((e.target as HTMLSelectElement).value, 10);
    const lang = AVAILABLE_LANGUAGES.find(l => l.lcid === lcid);
    if (lang) onLanguageChange(lang);
  });

  container.querySelector('#btnCopyAll')?.addEventListener('click', () => {
    onCopyAllEnglish();
  });

  let searchTimeout = 0;
  container.querySelector('#txtSearch')?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = window.setTimeout(() => {
      onSearchChange((e.target as HTMLInputElement).value);
    }, 250);
  });
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
