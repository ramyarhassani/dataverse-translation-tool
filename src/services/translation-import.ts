import JSZip from 'jszip';
import { TranslationUpdate, ImportResult } from '../types';
import { batchUpdateXmlCells, CellUpdate, repackZip } from '../utils/xml-parser';
import { log } from '../components/debug-log';

const MAX_TRANSLATION_LENGTH = 500;

/**
 * Apply translation updates to the XML, re-zip, and import back into Dataverse.
 */
export async function importTranslations(
  xml: string,
  zip: JSZip,
  updates: TranslationUpdate[],
  targetLcid: number
): Promise<ImportResult> {
  if (updates.length === 0) {
    return { success: true, message: 'No translations to import.', applied: 0 };
  }

  // Validate 500-char limit
  const tooLong = updates.filter(u => u.target.length > MAX_TRANSLATION_LENGTH);
  if (tooLong.length > 0) {
    log('warn', `${tooLong.length} translation(s) exceed ${MAX_TRANSLATION_LENGTH} chars — skipping those`);
  }

  // Build batch of valid updates
  const cellUpdates: CellUpdate[] = [];
  for (const update of updates) {
    if (!update.target.trim()) continue;
    if (update.target.length > MAX_TRANSLATION_LENGTH) continue;

    const parts = update.id.split('|');
    if (parts.length !== 2) continue;

    cellUpdates.push({
      worksheetName: parts[0],
      rowIndex: parseInt(parts[1], 10),
      value: update.target,
    });
  }

  if (cellUpdates.length === 0) {
    return { success: true, message: 'No valid translations to import.', applied: 0 };
  }

  log('info', `Applying ${cellUpdates.length} translation(s) to XML...`);

  // Single parse → batch update → single serialize
  const targetLcidStr = targetLcid.toString();
  const updatedXml = batchUpdateXmlCells(xml, targetLcidStr, cellUpdates);

  // Re-zip
  log('debug', 'Re-packing ZIP...');
  const base64Zip = await repackZip(zip, updatedXml);

  // Import via Dataverse action
  const importJobId = crypto.randomUUID();
  log('info', `Calling ImportTranslation (JobId: ${importJobId.substring(0, 8)}...)...`);

  try {
    await window.dataverseAPI.execute({
      operationName: 'ImportTranslation',
      operationType: 'action',
      parameters: {
        TranslationFile: base64Zip,
        ImportJobId: importJobId,
      },
    });
  } catch {
    // Fallback: try with full namespace
    await window.dataverseAPI.execute({
      operationName: 'Microsoft.Dynamics.CRM.ImportTranslation',
      operationType: 'action',
      parameters: {
        TranslationFile: base64Zip,
        ImportJobId: importJobId,
      },
    });
  }

  // Poll import job status
  log('debug', 'Polling import job status...');
  await pollImportJob(importJobId);

  // Publish all customizations
  log('info', 'Publishing customizations...');
  await window.dataverseAPI.publishCustomizations();
  log('success', 'Publish complete');

  const skipped = tooLong.length;
  const message = skipped > 0
    ? `Imported ${cellUpdates.length} translation(s) and published. ${skipped} skipped (>500 chars).`
    : `Imported ${cellUpdates.length} translation(s) and published.`;

  return { success: true, message, applied: cellUpdates.length };
}

/**
 * Poll importjobs entity until completed or timeout.
 */
async function pollImportJob(importJobId: string, maxWaitMs = 60000): Promise<void> {
  const start = Date.now();
  const pollInterval = 2000;

  while (Date.now() - start < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    try {
      const job = await window.dataverseAPI.queryData(
        `importjobs(${importJobId})?$select=progress,completedon`
      ) as Record<string, unknown>;

      const progress = job.progress as number | undefined;
      if (progress !== undefined) {
        log('debug', `Import progress: ${progress}%`);
      }

      if (job.completedon) {
        log('success', 'Import job completed');
        return;
      }
    } catch {
      // Job may not exist yet, keep polling
    }
  }

  log('warn', 'Import job polling timed out — continuing with publish');
}
