export type TranslationCategory = 
  | 'attribute'
  | 'optionset'
  | 'form'
  | 'view'
  | 'command'
  | 'entity-label'
  | 'other';

export interface TranslationItem {
  id: string;
  worksheet: string;
  rowIndex: number;
  entity: string;
  english: string;
  target: string;
  isMissing: boolean;
  context: Record<string, string>;
  objectType: string;
  objectParent: string;
  category: TranslationCategory;
}

export interface TranslationUpdate {
  id: string;
  target: string;
}

export interface ImportResult {
  success: boolean;
  message: string;
  applied: number;
}

export interface LanguageOption {
  lcid: number;
  code: string;
  name: string;
}

export interface TabDefinition {
  id: TranslationCategory | 'all';
  label: string;
  icon: string;
}

export const CATEGORY_TABS: TabDefinition[] = [
  { id: 'all', label: 'All', icon: '📋' },
  { id: 'attribute', label: 'Attributes', icon: '🏷️' },
  { id: 'optionset', label: 'OptionSets', icon: '📝' },
  { id: 'form', label: 'Forms', icon: '📄' },
  { id: 'view', label: 'Views', icon: '👁️' },
  { id: 'command', label: 'Commands', icon: '⚡' },
  { id: 'entity-label', label: 'Entity Labels', icon: '🗂️' },
  { id: 'other', label: 'Other', icon: '📦' },
];

export interface AppState {
  items: TranslationItem[];
  currentEntity: string | null;
  currentTab: TranslationCategory | 'all';
  targetLanguage: LanguageOption;
  solutionName: string;
  isLoading: boolean;
  searchQuery: string;
}
