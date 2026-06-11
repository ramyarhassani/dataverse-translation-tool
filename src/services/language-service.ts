import { LanguageOption } from '../types';

/**
 * Common Power Platform languages with their LCID codes.
 */
export const AVAILABLE_LANGUAGES: LanguageOption[] = [
  { lcid: 1025, code: 'ar', name: 'Arabic (العربية)' },
  { lcid: 1026, code: 'bg', name: 'Bulgarian (Български)' },
  { lcid: 1027, code: 'ca', name: 'Catalan (Català)' },
  { lcid: 1028, code: 'zh-TW', name: 'Chinese Traditional (繁體中文)' },
  { lcid: 1029, code: 'cs', name: 'Czech (Čeština)' },
  { lcid: 1030, code: 'da', name: 'Danish (Dansk)' },
  { lcid: 1031, code: 'de', name: 'German (Deutsch)' },
  { lcid: 1032, code: 'el', name: 'Greek (Ελληνικά)' },
  { lcid: 1035, code: 'fi', name: 'Finnish (Suomi)' },
  { lcid: 1036, code: 'fr', name: 'French (Français)' },
  { lcid: 1037, code: 'he', name: 'Hebrew (עברית)' },
  { lcid: 1038, code: 'hu', name: 'Hungarian (Magyar)' },
  { lcid: 1040, code: 'it', name: 'Italian (Italiano)' },
  { lcid: 1041, code: 'ja', name: 'Japanese (日本語)' },
  { lcid: 1042, code: 'ko', name: 'Korean (한국어)' },
  { lcid: 1043, code: 'nl', name: 'Dutch (Nederlands)' },
  { lcid: 1044, code: 'nb', name: 'Norwegian Bokmål (Norsk)' },
  { lcid: 1045, code: 'pl', name: 'Polish (Polski)' },
  { lcid: 1046, code: 'pt-BR', name: 'Portuguese - Brazil (Português)' },
  { lcid: 1048, code: 'ro', name: 'Romanian (Română)' },
  { lcid: 1049, code: 'ru', name: 'Russian (Русский)' },
  { lcid: 1050, code: 'hr', name: 'Croatian (Hrvatski)' },
  { lcid: 1051, code: 'sk', name: 'Slovak (Slovenčina)' },
  { lcid: 1053, code: 'sv', name: 'Swedish (Svenska)' },
  { lcid: 1054, code: 'th', name: 'Thai (ไทย)' },
  { lcid: 1055, code: 'tr', name: 'Turkish (Türkçe)' },
  { lcid: 1057, code: 'id', name: 'Indonesian (Bahasa Indonesia)' },
  { lcid: 1058, code: 'uk', name: 'Ukrainian (Українська)' },
  { lcid: 1060, code: 'sl', name: 'Slovenian (Slovenščina)' },
  { lcid: 1061, code: 'et', name: 'Estonian (Eesti)' },
  { lcid: 1062, code: 'lv', name: 'Latvian (Latviešu)' },
  { lcid: 1063, code: 'lt', name: 'Lithuanian (Lietuvių)' },
  { lcid: 1066, code: 'vi', name: 'Vietnamese (Tiếng Việt)' },
  { lcid: 1069, code: 'eu', name: 'Basque (Euskara)' },
  { lcid: 1081, code: 'hi', name: 'Hindi (हिन्दी)' },
  { lcid: 1086, code: 'ms', name: 'Malay (Bahasa Melayu)' },
  { lcid: 1087, code: 'kk', name: 'Kazakh (Қазақ)' },
  { lcid: 1110, code: 'gl', name: 'Galician (Galego)' },
  { lcid: 2052, code: 'zh-CN', name: 'Chinese Simplified (简体中文)' },
  { lcid: 2070, code: 'pt-PT', name: 'Portuguese - Portugal (Português)' },
  { lcid: 2074, code: 'sr-Latn', name: 'Serbian Latin (Srpski)' },
  { lcid: 3076, code: 'zh-HK', name: 'Chinese - Hong Kong (中文)' },
  { lcid: 3082, code: 'es', name: 'Spanish (Español)' },
  { lcid: 3098, code: 'sr-Cyrl', name: 'Serbian Cyrillic (Српски)' },
];

export const ENGLISH_LCID = 1033;

/**
 * Get the default language (Danish) or load from saved settings.
 */
export async function getSavedLanguage(): Promise<LanguageOption> {
  try {
    const saved = await window.toolboxAPI.settings.get('translation-tool:targetLanguage') as LanguageOption | null;
    if (saved && saved.lcid) {
      return saved;
    }
  } catch {
    // Fall back to default
  }
  return AVAILABLE_LANGUAGES[0]; // Danish
}

/**
 * Save the selected language to PPTB settings.
 */
export async function saveLanguage(language: LanguageOption): Promise<void> {
  await window.toolboxAPI.settings.set('translation-tool:targetLanguage', language);
}

/**
 * Find a language by LCID.
 */
export function getLanguageByLcid(lcid: number): LanguageOption | undefined {
  return AVAILABLE_LANGUAGES.find(l => l.lcid === lcid);
}

/**
 * Fetch provisioned (enabled) languages from the Dataverse environment.
 * Returns an array of LCIDs that are available for translation.
 */
export async function fetchProvisionedLanguages(): Promise<number[]> {
  try {
    const resp = await window.dataverseAPI.execute({
      operationName: 'RetrieveProvisionedLanguages',
      operationType: 'function',
    }) as { RetrieveProvisionedLanguages?: { value?: number[] }; value?: number[] };

    // Response shape may vary
    const lcids = resp.RetrieveProvisionedLanguages?.value || resp.value || [];
    // Filter out English (base language)
    return lcids.filter((l: number) => l !== ENGLISH_LCID);
  } catch {
    // Fallback: return empty (will detect from export headers instead)
    return [];
  }
}
