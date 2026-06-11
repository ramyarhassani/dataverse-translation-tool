import { TranslationItem } from '../types';

export interface SidebarProps {
  items: TranslationItem[];
  currentEntity: string | null;
  getDraftValue: (id: string) => string;
  onSelectEntity: (entity: string | null) => void;
}

const GLOBAL_ENTITIES = new Set(['', 'Solution', 'Publisher', 'SiteMap', 'AppModule']);

export function renderSidebar(container: HTMLElement, props: SidebarProps): void {
  const { items, currentEntity, getDraftValue, onSelectEntity } = props;

  const entities: Record<string, { total: number; missing: number }> = {};
  let globalTotal = 0;
  let globalMissing = 0;

  for (const item of items) {
    const ent = item.entity || '';
    if (GLOBAL_ENTITIES.has(ent)) {
      globalTotal++;
      if (item.isMissing && !getDraftValue(item.id)) globalMissing++;
    } else {
      if (!entities[ent]) entities[ent] = { total: 0, missing: 0 };
      entities[ent].total++;
      if (item.isMissing && !getDraftValue(item.id)) entities[ent].missing++;
    }
  }

  const sorted = Object.entries(entities).sort((a, b) => b[1].missing - a[1].missing);
  const totalMissing = items.filter(i => i.isMissing && !getDraftValue(i.id)).length;

  let html = `<div class="sidebar-section-label">ALL</div>`;
  html += `<div class="entity-item ${!currentEntity ? 'active' : ''}" data-entity="">
    <span>All Entities</span><span class="badge">${totalMissing}</span>
  </div>`;

  html += `<div class="sidebar-section-label">ENTITIES</div>`;
  for (const [name, counts] of sorted) {
    const active = currentEntity === name ? 'active' : '';
    const badgeClass = counts.missing === 0 ? 'badge done' : 'badge';
    html += `<div class="entity-item ${active}" data-entity="${escapeAttr(name)}" title="${escapeAttr(name)}">
      <span class="entity-name">${escapeHtml(name)}</span><span class="${badgeClass}">${counts.missing}</span>
    </div>`;
  }

  if (globalTotal > 0) {
    html += `<div class="sidebar-section-label">GLOBAL</div>`;
    const active = currentEntity === '__GLOBAL__' ? 'active' : '';
    const badgeClass = globalMissing === 0 ? 'badge done' : 'badge';
    html += `<div class="entity-item ${active}" data-entity="__GLOBAL__">
      <span>Solution / Other</span><span class="${badgeClass}">${globalMissing}</span>
    </div>`;
  }

  container.innerHTML = html;

  // Event delegation
  container.querySelectorAll('.entity-item').forEach(el => {
    el.addEventListener('click', () => {
      const entity = (el as HTMLElement).dataset.entity || null;
      onSelectEntity(entity || null);
    });
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
