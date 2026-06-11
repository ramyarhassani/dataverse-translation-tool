import JSZip from 'jszip';
import { TranslationItem, LanguageOption } from '../types';
import { extractAndParseZip, parseSpreadsheetXml } from '../utils/xml-parser';
import { withRetry } from '../utils/retry';
import { ENGLISH_LCID, AVAILABLE_LANGUAGES, getLanguageByLcid } from './language-service';
import { log } from '../components/debug-log';

export interface ExportResult {
  items: TranslationItem[];
  xml: string;
  zip: JSZip;
  /** LCIDs found in the export (excluding English) */
  availableLanguages: number[];
}

/**
 * Custom error thrown when the target language is not available in the export.
 */
export class LanguageNotAvailableError extends Error {
  constructor(
    public targetLcid: number,
    public availableLcids: number[],
    /** The already-fetched XML and ZIP so we can re-parse without another Dataverse call */
    public cachedXml: string,
    public cachedZip: JSZip,
  ) {
    const targetName = getLanguageByLcid(targetLcid)?.name || `LCID:${targetLcid}`;
    const availableNames = availableLcids
      .map(l => getLanguageByLcid(l)?.name || `LCID:${l}`)
      .join(', ');
    super(`Target language "${targetName}" not found in export. Available: ${availableNames || 'none'}`);
    this.name = 'LanguageNotAvailableError';
  }
}

/**
 * Export translations from Dataverse and parse into structured items.
 */
export async function exportTranslations(solutionName: string, targetLcid: number): Promise<ExportResult> {
  log('debug', 'Calling ExportTranslation (bound to solution entity)...');

  const result = await withRetry(
    () => window.dataverseAPI.execute({
      entityName: 'solution',
      operationName: 'ExportTranslation',
      operationType: 'action',
      parameters: { SolutionName: solutionName },
    }),
    'ExportTranslation',
  );

  log('success', 'ExportTranslation succeeded');

  log('debug', `Response keys: ${Object.keys(result).join(', ')}`);
  
  const base64Zip = (result.ExportTranslationFile || result.exportTranslationFile || result.ExportTranslationFileContent) as string;
  if (!base64Zip) {
    const preview = JSON.stringify(result).substring(0, 300);
    log('error', 'ExportTranslationFile empty in response', `Keys: ${Object.keys(result).join(', ')}\nPreview: ${preview}`);
    throw new Error(`ExportTranslationFile was empty. Response keys: ${Object.keys(result).join(', ')}`);
  }

  log('info', `ZIP data received (${Math.round(base64Zip.length / 1024)}KB base64)`);

  // Extract ZIP and parse XML
  log('debug', 'Parsing ZIP and XML...');
  const { xml, zip } = await extractAndParseZip(base64Zip);
  const spreadsheet = parseSpreadsheetXml(xml, ENGLISH_LCID.toString(), targetLcid.toString());

  // Convert to TranslationItems
  const items: TranslationItem[] = [];
  const englishLcidStr = ENGLISH_LCID.toString();
  const targetLcidStr = targetLcid.toString();

  // Auto-detect all available LCIDs from headers
  const allDetectedLcids = new Set<number>();

  log('debug', `Looking for English LCID=${englishLcidStr}, Target LCID=${targetLcidStr}`);
  log('info', `Found ${spreadsheet.worksheets.length} worksheet(s)`);

  for (const ws of spreadsheet.worksheets) {
    // Find column indices
    let englishCol = -1;
    let targetCol = -1;
    let entityCol = -1;
    const colNames: Record<number, string> = {};

    // Scan all headers and detect LCID columns
    const lcidPattern = /^(?:LCID:)?(\d{4,5})$/;
    const wsLcids: number[] = [];

    for (let i = 0; i < ws.headerRow.length; i++) {
      const val = ws.headerRow[i].trim();
      if (!val) continue;
      colNames[i] = val;

      const lcidMatch = val.match(lcidPattern);
      if (lcidMatch) {
        const lcid = parseInt(lcidMatch[1], 10);
        wsLcids.push(lcid);
        if (lcid !== ENGLISH_LCID) allDetectedLcids.add(lcid);
      }

      if (val === englishLcidStr || val === `LCID:${englishLcidStr}`) englishCol = i;
      if (val === targetLcidStr || val === `LCID:${targetLcidStr}`) targetCol = i;
      if (val.toLowerCase().includes('entity')) entityCol = i;
    }

    const nonEmptyHeaders = ws.headerRow.filter(h => h.trim()).length;
    log('debug', `Worksheet "${ws.name}": ${nonEmptyHeaders} headers, ${ws.dataRows.length} data rows`);
    log('debug', `  LCIDs found: ${wsLcids.join(', ') || 'none'}`);
    log('debug', `  English col: ${englishCol}, Target col: ${targetCol}, Entity col: ${entityCol}`);

    if (englishCol < 0) {
      log('warn', `  Skipping "${ws.name}": English column (LCID:${englishLcidStr}) not found`);
      continue;
    }
    if (targetCol < 0) {
      log('warn', `  Skipping "${ws.name}": Target column (LCID:${targetLcidStr}) not found`);
      continue;
    }

    for (let r = 0; r < ws.dataRows.length; r++) {
      const row = ws.dataRows[r];
      const english = row[englishCol] || '';
      const target = row[targetCol] || '';

      if (!english.trim()) continue;

      const entity = entityCol >= 0 ? row[entityCol] || '' : '';

      // Build context
      const context: Record<string, string> = {};
      for (const [colIdx, colName] of Object.entries(colNames)) {
        const idx = parseInt(colIdx, 10);
        if (idx !== englishCol && idx !== targetCol && row[idx]?.trim()) {
          context[colName] = row[idx];
        }
      }

      items.push({
        id: `${ws.name}|${r + 1}`,
        worksheet: ws.name,
        rowIndex: r + 1,
        entity,
        english,
        target,
        isMissing: !target.trim(),
        context,
        objectType: '',
        objectParent: '',
        category: 'other',
      });
    }
  }

  const availableLanguages = Array.from(allDetectedLcids);

  // If no items found and we detected languages, check for mismatch
  if (items.length === 0 && availableLanguages.length > 0) {
    log('error', `Target LCID ${targetLcid} not available! Available: ${availableLanguages.join(', ')}`);
    throw new LanguageNotAvailableError(targetLcid, availableLanguages, xml, zip);
  }

  return { items, xml, zip, availableLanguages };
}

/**
 * Re-parse a previously fetched export with a different target language.
 * Avoids a second Dataverse call (~75s saved).
 */
export function reparseExport(xml: string, zip: JSZip, targetLcid: number): ExportResult {
  const spreadsheet = parseSpreadsheetXml(xml, ENGLISH_LCID.toString(), targetLcid.toString());
  const items: TranslationItem[] = [];
  const englishLcidStr = ENGLISH_LCID.toString();
  const targetLcidStr = targetLcid.toString();
  const allDetectedLcids = new Set<number>();

  log('info', `Re-parsing with target LCID=${targetLcidStr}`);

  for (const ws of spreadsheet.worksheets) {
    let englishCol = -1;
    let targetCol = -1;
    let entityCol = -1;
    const colNames: Record<number, string> = {};
    const lcidPattern = /^(?:LCID:)?(\d{4,5})$/;

    for (let i = 0; i < ws.headerRow.length; i++) {
      const val = ws.headerRow[i].trim();
      if (!val) continue;
      colNames[i] = val;
      const lcidMatch = val.match(lcidPattern);
      if (lcidMatch) {
        const lcid = parseInt(lcidMatch[1], 10);
        if (lcid !== ENGLISH_LCID) allDetectedLcids.add(lcid);
      }
      if (val === englishLcidStr || val === `LCID:${englishLcidStr}`) englishCol = i;
      if (val === targetLcidStr || val === `LCID:${targetLcidStr}`) targetCol = i;
      if (val.toLowerCase().includes('entity')) entityCol = i;
    }

    if (englishCol < 0 || targetCol < 0) continue;

    for (let r = 0; r < ws.dataRows.length; r++) {
      const row = ws.dataRows[r];
      const english = row[englishCol] || '';
      const target = row[targetCol] || '';
      if (!english.trim()) continue;
      const entity = entityCol >= 0 ? row[entityCol] || '' : '';
      const context: Record<string, string> = {};
      for (const [colIdx, colName] of Object.entries(colNames)) {
        const idx = parseInt(colIdx, 10);
        if (idx !== englishCol && idx !== targetCol && row[idx]?.trim()) {
          context[colName] = row[idx];
        }
      }
      items.push({
        id: `${ws.name}|${r + 1}`,
        worksheet: ws.name,
        rowIndex: r + 1,
        entity, english, target,
        isMissing: !target.trim(),
        context,
        objectType: '', objectParent: '', category: 'other',
      });
    }
  }

  log('success', `Re-parse returned ${items.length} items`);
  return { items, xml, zip, availableLanguages: Array.from(allDetectedLcids) };
}
