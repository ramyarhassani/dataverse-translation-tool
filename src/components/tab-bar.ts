import { TranslationCategory, CATEGORY_TABS } from '../types';

export interface TabBarProps {
  currentTab: TranslationCategory | 'all';
  counts: Record<TranslationCategory | 'all', { total: number; missing: number }>;
  onTabChange: (tab: TranslationCategory | 'all') => void;
}

export function renderTabBar(container: HTMLElement, props: TabBarProps): void {
  const { currentTab, counts, onTabChange } = props;

  container.innerHTML = '';
  container.className = 'tab-bar';

  for (const tab of CATEGORY_TABS) {
    const count = counts[tab.id];
    // Skip tabs with 0 items (except 'all')
    if (tab.id !== 'all' && count.total === 0) continue;

    const btn = document.createElement('button');
    btn.className = `tab-btn${currentTab === tab.id ? ' active' : ''}`;
    btn.type = 'button';

    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = `${tab.icon} ${tab.label}`;
    btn.appendChild(label);

    if (count.missing > 0) {
      const badge = document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = count.missing.toString();
      btn.appendChild(badge);
    }

    btn.addEventListener('click', () => onTabChange(tab.id));
    container.appendChild(btn);
  }
}
