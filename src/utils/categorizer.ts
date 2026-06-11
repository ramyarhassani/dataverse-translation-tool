import { TranslationCategory, TranslationItem } from '../types';

/**
 * Categorize a translation item based on its resolved objectType,
 * worksheet name, and context (Object Column Name).
 */
export function categorizeItem(item: TranslationItem): TranslationCategory {
  const type = item.objectType.toLowerCase();
  const colName = (item.context['Object Column Name'] || '').toLowerCase();
  const worksheet = item.worksheet.toLowerCase();

  // Entity labels: entity display names (singular/plural/description)
  if (
    type.includes('entity') ||
    colName === 'localizedcollectionname' ||
    colName === 'localizedname' ||
    worksheet.includes('display string') ||
    worksheet.includes('entity')
  ) {
    return 'entity-label';
  }

  // Forms: form names, tabs, sections, cells
  if (type.includes('form')) {
    return 'form';
  }

  // Views
  if (type === 'view' || worksheet.includes('view')) {
    return 'view';
  }

  // Commands / Ribbon
  if (type === 'command' || colName.startsWith('button') || worksheet.includes('ribbon')) {
    return 'command';
  }

  // OptionSet values
  if (type.includes('optionset') || type.includes('option set')) {
    return 'optionset';
  }

  // Attributes: field labels and descriptions
  if (
    type === 'attribute' ||
    type === 'label' ||
    type === 'description' ||
    colName === 'displayname' ||
    colName === 'description'
  ) {
    return 'attribute';
  }

  // Fallback: try to infer from worksheet name
  if (worksheet.includes('attribute') || worksheet.includes('field')) {
    return 'attribute';
  }
  if (worksheet.includes('option') || worksheet.includes('picklist')) {
    return 'optionset';
  }

  return 'other';
}

/**
 * Apply categories to all items. Call this AFTER metadata resolution.
 */
export function categorizeItems(items: TranslationItem[]): void {
  for (const item of items) {
    item.category = categorizeItem(item);
  }
}

/**
 * Get counts per category for a set of items.
 */
export function getCategoryCounts(items: TranslationItem[]): Record<TranslationCategory | 'all', { total: number; missing: number }> {
  const counts: Record<string, { total: number; missing: number }> = {
    all: { total: 0, missing: 0 },
    attribute: { total: 0, missing: 0 },
    optionset: { total: 0, missing: 0 },
    form: { total: 0, missing: 0 },
    view: { total: 0, missing: 0 },
    command: { total: 0, missing: 0 },
    'entity-label': { total: 0, missing: 0 },
    other: { total: 0, missing: 0 },
  };

  for (const item of items) {
    counts.all.total++;
    if (item.isMissing) counts.all.missing++;

    const cat = item.category || 'other';
    if (counts[cat]) {
      counts[cat].total++;
      if (item.isMissing) counts[cat].missing++;
    }
  }

  return counts as Record<TranslationCategory | 'all', { total: number; missing: number }>;
}
