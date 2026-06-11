import { TranslationItem } from '../types';

export interface TableProps {
  items: TranslationItem[];
  getDraftValue: (id: string) => string;
  onInputChange: (id: string, value: string) => void;
  onCopyEnglish: (id: string) => void;
}

export function renderTable(container: HTMLElement, props: TableProps): void {
  const { items, getDraftValue, onInputChange, onCopyEnglish } = props;

  if (items.length === 0) {
    container.innerHTML = '<p class="empty-state">✓ No items match the current filters.</p>';
    return;
  }

  let html = `<table class="translation-table">
    <thead><tr>
      <th class="col-type">Type</th>
      <th class="col-context">Context</th>
      <th class="col-english">English</th>
      <th class="col-target">Target</th>
      <th class="col-action"></th>
    </tr></thead><tbody>`;

  for (const item of items) {
    const draft = getDraftValue(item.id);
    const displayValue = draft || item.target || '';
    const hasValue = displayValue.length > 0;
    const trClass = hasValue ? 'translated' : '';

    // Build context display
    const contextParts: string[] = [];
    if (item.objectParent) contextParts.push(item.objectParent);
    else if (item.entity) contextParts.push(item.entity);
    const colName = item.context['Object Column Name'] || '';
    if (colName) contextParts.push(colName);
    const contextDisplay = contextParts.join(' → ');

    const typeDisplay = item.objectType || item.category || '';

    html += `<tr class="${trClass}">
      <td class="col-type"><span class="type-badge type-${item.category}">${escapeHtml(typeDisplay)}</span></td>
      <td class="col-context" title="${escapeAttr(contextDisplay)}">${escapeHtml(contextDisplay)}</td>
      <td class="col-english" title="${escapeAttr(item.english)}">${escapeHtml(item.english)}</td>
      <td class="col-target"><input type="text" value="${escapeAttr(displayValue)}" 
        data-id="${escapeAttr(item.id)}" class="${hasValue ? 'has-value' : ''}"
        placeholder="Enter translation..."></td>
      <td class="col-action"><button class="copy-btn" data-copy-id="${escapeAttr(item.id)}" title="Copy English">📋</button></td>
    </tr>`;
  }

  html += '</tbody></table>';
  html += `<div class="table-footer">${items.length} items shown</div>`;
  container.innerHTML = html;

  // Event delegation for inputs
  container.querySelectorAll<HTMLInputElement>('input[data-id]').forEach(input => {
    input.addEventListener('input', () => {
      const id = input.dataset.id!;
      onInputChange(id, input.value);
      input.classList.toggle('has-value', input.value.length > 0);
      input.closest('tr')?.classList.toggle('translated', input.value.length > 0);
    });
    // Tab navigation: move to next input on Tab
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey) {
        const allInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[data-id]'));
        const idx = allInputs.indexOf(input);
        if (idx < allInputs.length - 1) {
          e.preventDefault();
          allInputs[idx + 1].focus();
        }
      }
    });
  });

  // Event delegation for copy buttons
  container.querySelectorAll<HTMLButtonElement>('button[data-copy-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.copyId!;
      onCopyEnglish(id);
    });
  });
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
